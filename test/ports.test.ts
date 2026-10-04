// CORE-06 a CORE-10 — Testes das portas do Core: fakes tipados, sem vendor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ports from '../src/core/ports.ts';
import {
  isRole,
  isLoopState,
  isGateId,
  toNonEmptyString,
  type Role,
  type LoopState,
  type GateId,
  type JournalEntry,
  type MonitorEvent,
} from '../src/core/types.ts';
import type {
  AgenticAdapter,
  StackProfile,
  Gate,
  GateCatalog,
  JournalSink,
  Monitor,
  RoutingStatus,
  GateResolution,
} from '../src/core/ports.ts';

function buildEntry(action: string): JournalEntry {
  return {
    schemaVersion: '1.0',
    sprint: 'sprint-0',
    cycle: 1,
    iteration: 1,
    phase: 'IMPLEMENTING',
    role: 'sprint-implementer',
    action,
    result: 'OK',
    timestamp: '2026-10-01T00:00:00.000Z',
    branch: 'main',
    shaBase: 'abc1234',
  };
}

function buildEvent(type: string): MonitorEvent {
  return {
    schemaVersion: '1.0',
    type,
    timestamp: '2026-10-01T00:00:00.000Z',
    sprintId: 'sprint-0',
    cycle: 1,
    iteration: 1,
    phase: 'GATE_RUN',
    role: 'sprint-tester',
    branch: 'main',
    shaBase: 'abc1234',
    payload: { source: 'fake' },
  };
}

function buildFakeAdapter(routed: Role[]): AgenticAdapter {
  return {
    identifyRoles(): readonly Role[] {
      return ['sprint-orchestrator', 'sprint-implementer'];
    },
    applyRouting(roles: readonly Role[]): void {
      routed.push(...roles);
    },
    reportRoutingStatus(): RoutingStatus {
      return 'AGENT_ROUTING_PASS';
    },
    resolveGate(gateId: GateId, profile: StackProfile): GateResolution {
      const gate: Gate = { id: gateId, order: 5, intent: 'Rodar gate via profile' };
      const command = profile.commands[gateId];
      if (command === undefined) {
        return { status: 'UNAVAILABLE', gate, reason: 'no command mapped' };
      }
      return { status: 'RESOLVED', gate, command };
    },
    serializeLoopState(state: LoopState): string {
      return JSON.stringify({ state });
    },
    deserializeLoopState(serialized: string): LoopState {
      const parsed = JSON.parse(serialized) as { state: LoopState };
      return parsed.state;
    },
    emit(event: MonitorEvent): void {
      event.payload['forwarded'] = true;
    },
  };
}

test('CORE-06: Gate e GateCatalog aceitam objeto-fake tipado', () => {
  const fakeGate: Gate = {
    id: 'lint',
    order: 3,
    intent: 'Verificar estilo do código',
  };
  const fakeCatalog: GateCatalog = {
    gates: [fakeGate],
  };
  assert.equal(fakeGate.id, 'lint');
  assert.equal(fakeGate.order, 3);
  assert.equal(fakeGate.intent, 'Verificar estilo do código');
  assert.ok(isGateId(fakeGate.id));
  assert.equal(fakeCatalog.gates.length, 1);
  assert.equal(fakeCatalog.gates[0], fakeGate);
});

test('CORE-07: StackProfile é declarativo (gates válidos e comando por gate)', () => {
  const fakeProfile: StackProfile = {
    validGateIds: ['whitespace', 'format', 'lint'],
    commands: {
      whitespace: toNonEmptyString('git diff --check'),
      format: toNonEmptyString('npm run format:check'),
      lint: toNonEmptyString('npm run lint'),
    },
  };
  assert.equal(fakeProfile.validGateIds.length, 3);
  for (const gateId of fakeProfile.validGateIds) {
    assert.ok(isGateId(gateId));
    assert.equal(typeof fakeProfile.commands[gateId], 'string');
  }
  assert.equal(fakeProfile.commands['whitespace'], 'git diff --check');
  assert.equal(fakeProfile.commands['format'], 'npm run format:check');
  assert.equal(fakeProfile.commands['lint'], 'npm run lint');
  assert.equal(fakeProfile.commands['audit'], undefined);
});

test('CORE-07: AgenticAdapter tem fake que implementa todas as operações da porta', () => {
  const routed: Role[] = [];
  const fakeProfile: StackProfile = {
    validGateIds: ['test'],
    commands: { test: toNonEmptyString('npm test') },
  };
  const fakeAdapter = buildFakeAdapter(routed);

  const roles = fakeAdapter.identifyRoles();
  assert.equal(roles.length, 2);
  assert.ok(isRole(roles[0]));
  fakeAdapter.applyRouting(roles);
  assert.deepEqual(routed, [...roles]);
  const status = fakeAdapter.reportRoutingStatus();
  assert.equal(status, 'AGENT_ROUTING_PASS');
  const resolution = fakeAdapter.resolveGate('test', fakeProfile);
  assert.equal(resolution.gate.id, 'test');
  if (resolution.status !== 'RESOLVED') {
    assert.fail(`Esperava status RESOLVED, obteve '${resolution.status}'`);
  }
  assert.equal(resolution.status, 'RESOLVED');
  assert.equal(resolution.command, 'npm test');
  const serialized = fakeAdapter.serializeLoopState('IMPLEMENTING');
  assert.equal(fakeAdapter.deserializeLoopState(serialized), 'IMPLEMENTING');
  const event = buildEvent('adapter_check');
  fakeAdapter.emit(event);
  assert.equal(event.payload['forwarded'], true);
});

test('SEC-03: gate sem comando mapeado resolve UNAVAILABLE — nunca sucesso silencioso', () => {
  const fakeProfile: StackProfile = {
    validGateIds: ['test'],
    commands: { test: toNonEmptyString('npm test') },
  };
  const fakeAdapter = buildFakeAdapter([]);

  // Gate válido, porém SEM mapeamento de comando: resultado explícito, sem comando vazio.
  const resolution = fakeAdapter.resolveGate('audit', fakeProfile);
  assert.equal(resolution.gate.id, 'audit');
  if (resolution.status !== 'UNAVAILABLE') {
    assert.fail(`Esperava status UNAVAILABLE, obteve '${resolution.status}'`);
  }
  assert.equal(resolution.status, 'UNAVAILABLE');
  assert.equal(resolution.reason, 'no command mapped');
  assert.equal('command' in resolution, false);

  // Comando vazio/branco não é representável: a validação falha fechado (fail-closed).
  assert.throws(() => toNonEmptyString(''), Error);
  assert.throws(() => toNonEmptyString('   '), Error);
});

test('CORE-08: JournalSink.append aceita JournalEntry e lê sequencialmente', () => {
  const entries: JournalEntry[] = [];
  const fakeJournal: JournalSink = {
    append(entry: JournalEntry): void {
      entries.push(entry);
    },
    readAll(): readonly JournalEntry[] {
      return entries.slice();
    },
  };
  const first = buildEntry('criar tipos');
  const second = buildEntry('criar erros');
  fakeJournal.append(first);
  fakeJournal.append(second);
  const read = fakeJournal.readAll();
  assert.equal(read.length, 2);
  assert.equal(read[0], first);
  assert.equal(read[1], second);
  assert.equal(read[0].action, 'criar tipos');
  assert.equal(read[1].action, 'criar erros');
  assert.ok(isRole(read[0].role));
  assert.ok(isLoopState(read[0].phase));
});

test('CORE-09: Monitor emite MonitorEvent para o fake registrado', () => {
  const received: MonitorEvent[] = [];
  const fakeMonitor: Monitor = {
    emit(event: MonitorEvent): void {
      received.push(event);
    },
  };
  const event = buildEvent('phase_transition');
  fakeMonitor.emit(event);
  assert.equal(received.length, 1);
  assert.equal(received[0], event);
  assert.equal(received[0].type, 'phase_transition');
  assert.equal(received[0].sprintId, 'sprint-0');
  assert.deepEqual(received[0].payload, { source: 'fake' });
});

test('CORE-10: portas são interfaces puras, sem implementações concretas exportadas', () => {
  assert.deepEqual(Object.keys(ports), []);
  assert.equal(typeof ports, 'object');
  const fakeMonitor: Monitor = {
    emit(): void {
      // fake vazio: a porta não traz comportamento embutido
    },
  };
  assert.equal(typeof fakeMonitor.emit, 'function');
  const fakeJournal: JournalSink = {
    append(): void {
      // fake vazio: a porta não traz comportamento embutido
    },
    readAll(): readonly JournalEntry[] {
      return [];
    },
  };
  assert.equal(typeof fakeJournal.append, 'function');
  assert.equal(typeof fakeJournal.readAll, 'function');
  assert.deepEqual(fakeJournal.readAll(), []);
});
