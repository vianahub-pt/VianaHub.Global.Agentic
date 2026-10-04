// ADP-02 / ADP-09 — Adapter OpenCode sobre o contrato AgenticAdapter.
// ADP-02: contrato implementado, mapeamento dos 6 papéis e validação de roteamento com as
// 5 sondagens de /sprint-loop-check (tokens exatos, zero ferramentas, sem fallback).
// ADP-09: nenhum adapter além de fake/ e opencode/ é implementado em src/adapters/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  OPENCODE_AGENT_BINDINGS,
  OPENCODE_ROUTING_PROBES,
  OpenCodeAdapter,
  validateRoutingProbes,
} from '../src/adapters/opencode/opencode-adapter.ts';
import { OPENCODE_GUARDRAIL_PATTERNS } from '../src/adapters/opencode/policies.ts';
import { assertCanEdit, checkEdit, GuardViolationError } from '../src/core/guards.ts';
import type { AgenticAdapter, Monitor, StackProfile } from '../src/core/ports.ts';
import type { GateId, LoopState, MonitorEvent, Role } from '../src/core/types.ts';
import { LOOP_STATES, ROLES, toNonEmptyString } from '../src/core/types.ts';
import {
  EXACT_DELEGATION,
  EXPECTED_ROLE_COUNT,
  ROLE_CONTRACTS,
  ROUTING_PROBE_CONTRACT,
} from '../src/core/roles.ts';
import { AGENT_OK_PREFIX, agentOkToken } from '../src/core/tokens.ts';
import { DomainError, UnknownStateError } from '../src/core/errors.ts';
import { UnknownGateError } from '../src/core/gates.ts';

const PORT_OPERATIONS = [
  'identifyRoles',
  'applyRouting',
  'reportRoutingStatus',
  'resolveGate',
  'serializeLoopState',
  'deserializeLoopState',
  'emit',
] as const;

const VENDOR_SPECIFIER_FRAGMENTS = ['openai', 'anthropic', 'codex', '@opencode'];

const TEST_PROFILE: StackProfile = {
  validGateIds: ['test'],
  commands: { test: toNonEmptyString('npm test') },
};

const PROFILE_WITHOUT_MAPPING: StackProfile = {
  validGateIds: ['test'],
  commands: {},
};

const EXPECTED_PROBE_MESSAGES = [
  'ROUTING_PROBE_ONLY: retorne somente AGENT_OK:sprint-architect; não use ferramentas ' +
    'nem realize qualquer outra operação.',
  'ROUTING_PROBE_ONLY: retorne somente AGENT_OK:sprint-implementer; não use ferramentas ' +
    'nem realize qualquer outra operação.',
  'ROUTING_PROBE_ONLY: retorne somente AGENT_OK:sprint-tester; não use ferramentas ' +
    'nem realize qualquer outra operação.',
  'ROUTING_PROBE_ONLY: retorne somente AGENT_OK:sprint-security; não use ferramentas ' +
    'nem realize qualquer outra operação.',
  'ROUTING_PROBE_ONLY: retorne somente AGENT_OK:sprint-reviewer; não use ferramentas ' +
    'nem realize qualquer outra operação.',
];

function buildEvent(type: string): MonitorEvent {
  return {
    schemaVersion: '1',
    type,
    timestamp: '2026-10-02T00:00:00.000Z',
    sprintId: 'sprint-0',
    cycle: 1,
    iteration: 1,
    phase: 'GATE_RUN',
    role: 'sprint-tester',
    branch: 'feature/sprint-0-bootstrap-agentic-framework',
    shaBase: 'abc1234',
    payload: { source: 'opencode' },
  };
}

function recordingMonitor(): { monitor: Monitor; events: MonitorEvent[] } {
  const events: MonitorEvent[] = [];
  return {
    monitor: {
      emit(event: MonitorEvent): void {
        events.push(event);
      },
    },
    events,
  };
}

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /^\s*import\s+['"]([^'"]+)['"]/gm];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

test('ADP-02: OpenCodeAdapter implementa AgenticAdapter (papéis, gates, loop-state, monitor)', () => {
  const { monitor, events } = recordingMonitor();
  const adapter = new OpenCodeAdapter(monitor);
  const port: AgenticAdapter = adapter;

  const implemented = Object.getOwnPropertyNames(OpenCodeAdapter.prototype);
  for (const operation of PORT_OPERATIONS) {
    assert.ok(implemented.includes(operation), `operação da porta sem '${operation}'`);
  }

  const roles = port.identifyRoles();
  assert.equal(roles.length, EXPECTED_ROLE_COUNT);
  port.applyRouting(roles);
  assert.equal(port.reportRoutingStatus(), 'AGENT_ROUTING_PASS');
  assert.equal(port.resolveGate('test', TEST_PROFILE).status, 'RESOLVED');
  assert.equal(port.deserializeLoopState(port.serializeLoopState('REVIEWING')), 'REVIEWING');

  const event = buildEvent('delegation');
  port.emit(event);
  assert.deepEqual(events, [event]);
});

test('ADP-02: o mapeamento dos 6 papéis preserva modo, escopo, permissões e token', () => {
  assert.deepEqual(Object.keys(OPENCODE_AGENT_BINDINGS), [...ROLES]);
  assert.equal(Object.keys(OPENCODE_AGENT_BINDINGS).length, EXPECTED_ROLE_COUNT);

  for (const role of ROLES) {
    const binding = OPENCODE_AGENT_BINDINGS[role];
    const contract = ROLE_CONTRACTS[role];
    assert.equal(binding.role, role);
    assert.equal(binding.agent, contract.id);
    assert.equal(binding.mode, contract.mode);
    assert.deepEqual(binding.editScope, contract.editScope);
    assert.deepEqual(binding.permissions, contract.permissions);
    assert.equal(binding.readOnly, contract.readOnly);
    assert.equal(binding.okToken, agentOkToken(contract.id));
    assert.ok(binding.okToken.startsWith(AGENT_OK_PREFIX));
  }
});

test('ADP-02: as 5 sondagens seguem ordem exata, mensagens exatas e zero ferramentas', () => {
  assert.equal(OPENCODE_ROUTING_PROBES.length, 5);
  assert.deepEqual(
    OPENCODE_ROUTING_PROBES.map((probe) => probe.agent),
    [...EXACT_DELEGATION],
  );
  assert.deepEqual(
    OPENCODE_ROUTING_PROBES.map((probe) => probe.message),
    EXPECTED_PROBE_MESSAGES,
  );
  assert.deepEqual(
    OPENCODE_ROUTING_PROBES.map((probe) => probe.expected),
    EXACT_DELEGATION.map((agent) => agentOkToken(agent)),
  );
  for (const probe of OPENCODE_ROUTING_PROBES) {
    assert.ok(probe.message.startsWith(ROUTING_PROBE_CONTRACT.triggerPrefix));
    assert.equal(probe.expected, `AGENT_OK:${probe.agent}`);
    assert.equal(ROUTING_PROBE_CONTRACT.allowedToolCount, 0);
  }
});

test('ADP-02: validação de roteamento aprova a sequência exata das 5 sondagens', () => {
  const responses = OPENCODE_ROUTING_PROBES.map((probe) => probe.expected);
  assert.equal(validateRoutingProbes(responses), 'AGENT_ROUTING_PASS');
});

test('ADP-02: token errado, texto extra, ordem trocada, fallback ou chamada extra invalidam', () => {
  const exact = OPENCODE_ROUTING_PROBES.map((probe) => probe.expected);

  const wrongToken = [...exact];
  wrongToken[2] = 'AGENT_OK:outro-agente';
  assert.equal(validateRoutingProbes(wrongToken), 'INVALID_AGENT_ROUTING');

  const extraText = [...exact];
  extraText[0] = 'AGENT_OK:sprint-architect seguido de explicação';
  assert.equal(validateRoutingProbes(extraText), 'INVALID_AGENT_ROUTING');

  const swapped = [...exact];
  const held = swapped[0] ?? '';
  swapped[0] = swapped[1] ?? '';
  swapped[1] = held;
  assert.equal(validateRoutingProbes(swapped), 'INVALID_AGENT_ROUTING');

  const fallback = [...exact];
  fallback[4] = 'AGENT_OK:general';
  assert.equal(validateRoutingProbes(fallback), 'INVALID_AGENT_ROUTING');

  const extraCall = [...exact, 'AGENT_OK:sprint-architect'];
  assert.equal(validateRoutingProbes(extraCall), 'INVALID_AGENT_ROUTING');
});

test('ADP-02: sondagens ausentes ou parciais exigem roteamento (AGENT_ROUTING_REQUIRED)', () => {
  const exact = OPENCODE_ROUTING_PROBES.map((probe) => probe.expected);

  assert.equal(validateRoutingProbes([]), 'AGENT_ROUTING_REQUIRED');
  assert.equal(validateRoutingProbes(exact.slice(0, 1)), 'AGENT_ROUTING_REQUIRED');
  assert.equal(validateRoutingProbes(exact.slice(0, 4)), 'AGENT_ROUTING_REQUIRED');

  // Parcial válido seguido de resposta inválida continua fail-closed.
  const partialWrong = [...exact.slice(0, 2), 'AGENT_OK:build'];
  assert.equal(validateRoutingProbes(partialWrong), 'INVALID_AGENT_ROUTING');
});

test('ADP-02: applyRouting/reportRoutingStatus refletem o roteamento aplicado', () => {
  const adapter = new OpenCodeAdapter(recordingMonitor().monitor);

  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_REQUIRED');
  adapter.applyRouting([...EXACT_DELEGATION]);
  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_PASS');
  assert.deepEqual([...adapter.routedRoles], [...EXACT_DELEGATION]);

  adapter.applyRouting(['scout'] as unknown as readonly Role[]);
  assert.equal(adapter.reportRoutingStatus(), 'INVALID_AGENT_ROUTING');
});

test('ADP-02: resolveGate delega ao Core via StackProfile e falha fechado', () => {
  const adapter = new OpenCodeAdapter(recordingMonitor().monitor);

  const resolved = adapter.resolveGate('test', TEST_PROFILE);
  if (resolved.status !== 'RESOLVED') {
    assert.fail(`Esperava status RESOLVED, obteve '${resolved.status}'`);
  }
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.command, 'npm test');

  const unavailable = adapter.resolveGate('audit', PROFILE_WITHOUT_MAPPING);
  if (unavailable.status !== 'UNAVAILABLE') {
    assert.fail(`Esperava status UNAVAILABLE, obteve '${unavailable.status}'`);
  }
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal('command' in unavailable, false);

  assert.throws(
    () => adapter.resolveGate('desconhecido' as unknown as GateId, TEST_PROFILE),
    UnknownGateError,
  );
});

test('ADP-02: loop-state serializa em JSON com validação fail-closed', () => {
  const adapter = new OpenCodeAdapter(recordingMonitor().monitor);

  for (const state of LOOP_STATES) {
    const serialized = adapter.serializeLoopState(state);
    assert.equal(JSON.parse(serialized), state);
    assert.equal(adapter.deserializeLoopState(serialized), state);
  }

  assert.throws(() => adapter.deserializeLoopState('{'), DomainError);
  assert.throws(() => adapter.deserializeLoopState('{"status":"IMPLEMENTING"}'), DomainError);
  assert.throws(() => adapter.deserializeLoopState('"ESTADO_FANTASMA"'), UnknownStateError);
  assert.throws(() => adapter.serializeLoopState('X' as unknown as LoopState), UnknownStateError);
});

test('ADP-02: emit encaminha cada MonitorEvent ao monitor injetado', () => {
  const { monitor, events } = recordingMonitor();
  const adapter = new OpenCodeAdapter(monitor);
  const first = buildEvent('sprint_started');
  const second = buildEvent('terminal_state');

  adapter.emit(first);
  adapter.emit(second);

  assert.deepEqual(events, [first, second]);
});

test('ADP-02: o adapter OpenCode implementa o contrato sem SDK de vendor', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'adapters', 'opencode', 'opencode-adapter.ts'),
    'utf8',
  );
  const specifiers = extractSpecifiers(source);
  assert.ok(specifiers.length > 0);
  for (const specifier of specifiers) {
    assert.match(specifier, /^\.\.\/\.\.\/core\/[a-z-]+\.ts$/);
    for (const fragment of VENDOR_SPECIFIER_FRAGMENTS) {
      assert.ok(!specifier.toLowerCase().includes(fragment), `SDK de vendor em '${specifier}'`);
    }
  }
});

test('ADP-10: política OpenCode protege opencode.json e .opencode/** como guardrails extras', () => {
  assert.deepEqual([...OPENCODE_GUARDRAIL_PATTERNS], ['opencode.json', '.opencode/**']);

  const targets = [
    'opencode.json',
    '.opencode/agents/sprint-implementer.md',
    '.opencode/commands/sprint-loop.md',
  ];
  for (const target of targets) {
    const decision = checkEdit('sprint-implementer', target, OPENCODE_GUARDRAIL_PATTERNS);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    assert.equal(decision.code, 'GUARDRAIL_PROTECTED');

    assert.throws(
      () => assertCanEdit('sprint-implementer', target, OPENCODE_GUARDRAIL_PATTERNS),
      (error: unknown) => {
        assert.ok(error instanceof GuardViolationError);
        assert.equal(error.guardCode, 'GUARDRAIL_PROTECTED');
        return true;
      },
    );
  }
});

test('ADP-09: src/adapters contém apenas fake/ e opencode/ — nenhum outro adapter', () => {
  const adaptersDir = path.join(process.cwd(), 'src', 'adapters');
  const entries = fs.readdirSync(adaptersDir).sort();
  assert.deepEqual(entries, ['fake', 'opencode']);
  for (const entry of entries) {
    assert.ok(
      fs.statSync(path.join(adaptersDir, entry)).isDirectory(),
      `entrada que não é diretório em src/adapters: '${entry}'`,
    );
  }
});
