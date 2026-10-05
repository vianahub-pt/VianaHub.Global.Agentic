// ADP-01 / ADP-06 — Contrato AgenticAdapter exercitado pelo adapter falso em memória.
// ADP-01: a porta cobre papéis, roteamento, gates, loop-state e monitor.
// ADP-06: o adapter falso permite testar o Core sem vendor real (estado somente em memória).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FakeAdapter } from '../src/adapters/fake/fake-adapter.ts';
import type { AgenticAdapter, StackProfile } from '../src/core/ports.ts';
import type { GateId, LoopState, MonitorEvent, Role } from '../src/core/types.ts';
import { LOOP_STATES, ROLES, toNonEmptyString } from '../src/core/types.ts';
import { EXPECTED_ROLE_COUNT } from '../src/core/roles.ts';
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

const VENDOR_SPECIFIER_FRAGMENTS = ['opencode', 'codex', 'openai', 'anthropic'];

const TEST_PROFILE: StackProfile = {
  validGateIds: ['test'],
  commands: { test: toNonEmptyString('npm test') },
};

const PROFILE_WITHOUT_MAPPING: StackProfile = {
  validGateIds: ['test'],
  commands: {},
};

function buildEvent(type: string): MonitorEvent {
  return {
    schemaVersion: '1',
    type,
    timestamp: '2026-10-02T00:00:00.000Z',
    sprintId: 'sprint-0',
    cycle: 1,
    iteration: 1,
    phase: 'IMPLEMENTING',
    role: 'sprint-implementer',
    branch: 'feature/sprint-0-bootstrap-agentic-framework',
    shaBase: 'abc1234',
    payload: { source: 'fake' },
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

test('ADP-01: a porta AgenticAdapter cobre papéis, roteamento, gates, loop-state e monitor', () => {
  const adapter = new FakeAdapter();
  const port: AgenticAdapter = adapter;

  const implemented = Object.getOwnPropertyNames(FakeAdapter.prototype);
  for (const operation of PORT_OPERATIONS) {
    assert.ok(implemented.includes(operation), `operação da porta sem '${operation}'`);
  }

  const roles = port.identifyRoles();
  assert.equal(roles.length, EXPECTED_ROLE_COUNT);

  port.applyRouting(roles);
  assert.equal(port.reportRoutingStatus(), 'AGENT_ROUTING_PASS');

  const resolution = port.resolveGate('test', TEST_PROFILE);
  assert.equal(resolution.status, 'RESOLVED');

  const serialized = port.serializeLoopState('IMPLEMENTING');
  assert.equal(port.deserializeLoopState(serialized), 'IMPLEMENTING');

  const event = buildEvent('contract_check');
  port.emit(event);
  assert.equal(adapter.events.length, 1);
});

test('ADP-01: identifyRoles retorna os 6 IDs de papéis canônicos', () => {
  const adapter = new FakeAdapter();
  const roles = adapter.identifyRoles();
  assert.equal(roles.length, EXPECTED_ROLE_COUNT);
  assert.deepEqual([...roles], [...ROLES]);
});

test('ADP-01: applyRouting/reportRoutingStatus resolvem o roteamento com fail-closed', () => {
  const adapter = new FakeAdapter();

  // Nenhum papel roteado ainda: roteamento exigido, nunca sucesso silencioso.
  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_REQUIRED');
  adapter.applyRouting([]);
  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_REQUIRED');

  adapter.applyRouting(['sprint-architect', 'sprint-implementer']);
  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_PASS');
  assert.deepEqual([...adapter.routedRoles], ['sprint-architect', 'sprint-implementer']);

  // Papel desconhecido (ex.: agente de fallback) invalida o roteamento e limpa o resultado.
  adapter.applyRouting(['general'] as unknown as readonly Role[]);
  assert.equal(adapter.reportRoutingStatus(), 'INVALID_AGENT_ROUTING');
  assert.deepEqual([...adapter.routedRoles], []);
});

test('ADP-01: resolveGate delega a resolução gate->comando ao Core via StackProfile', () => {
  const adapter = new FakeAdapter();

  const resolved = adapter.resolveGate('test', TEST_PROFILE);
  if (resolved.status !== 'RESOLVED') {
    assert.fail(`Esperava status RESOLVED, obteve '${resolved.status}'`);
  }
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.command, 'npm test');
  assert.equal(resolved.gate.id, 'test');

  // Gate sem mapeamento no profile: UNAVAILABLE explícito, nunca comando vazio.
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

test('ADP-01: serializeLoopState/deserializLoopState fazem round-trip JSON validado', () => {
  const adapter = new FakeAdapter();

  for (const state of LOOP_STATES) {
    const serialized = adapter.serializeLoopState(state);
    assert.equal(JSON.parse(serialized), state);
    assert.equal(adapter.deserializeLoopState(serialized), state);
  }

  assert.throws(() => adapter.deserializeLoopState('não é json'), DomainError);
  assert.throws(() => adapter.deserializeLoopState('{"status":"IMPLEMENTING"}'), DomainError);
  assert.throws(() => adapter.deserializeLoopState('"ESTADO_FANTASMA"'), UnknownStateError);
  assert.throws(() => adapter.serializeLoopState('X' as unknown as LoopState), UnknownStateError);
});

test('ADP-01: emit armazena os eventos de monitor em memória, na ordem', () => {
  const adapter = new FakeAdapter();
  const first = buildEvent('sprint_started');
  const second = buildEvent('phase_transition');

  adapter.emit(first);
  adapter.emit(second);

  assert.equal(adapter.events.length, 2);
  assert.equal(adapter.events[0], first);
  assert.equal(adapter.events[1], second);
  assert.ok(Object.isFrozen(adapter.events));
});

test('ADP-06: o adapter falso importa apenas o Core, sem vendor e sem I/O', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'adapters', 'fake', 'fake-adapter.ts'),
    'utf8',
  );
  const specifiers = extractSpecifiers(source);
  assert.ok(specifiers.length > 0);
  for (const specifier of specifiers) {
    assert.match(specifier, /^\.\.\/\.\.\/core\/[a-z-]+\.ts$/);
    for (const fragment of VENDOR_SPECIFIER_FRAGMENTS) {
      assert.ok(!specifier.toLowerCase().includes(fragment), `vendor em '${specifier}'`);
    }
    assert.ok(!specifier.startsWith('node:'), `I/O em '${specifier}'`);
  }
});

test('ADP-06: o adapter falso exercita o Core inteiramente em memória', () => {
  const adapter = new FakeAdapter();

  const roles = adapter.identifyRoles();
  adapter.applyRouting(roles);
  const resolution = adapter.resolveGate('test', TEST_PROFILE);
  const roundTrip = adapter.deserializeLoopState(adapter.serializeLoopState('GATE_RUN'));
  adapter.emit(buildEvent('gate_result'));

  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_PASS');
  assert.equal(resolution.status, 'RESOLVED');
  assert.equal(roundTrip, 'GATE_RUN');
  assert.equal(adapter.events.length, 1);
  assert.deepEqual([...adapter.routedRoles], [...roles]);
});
