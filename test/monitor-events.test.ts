import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMonitorEvent,
  MONITOR_EVENT_TYPES,
  MONITOR_SCHEMA_VERSION,
} from '../src/monitor/events.ts';

const corr = {
  sprintId: 'sprint-0',
  cycle: 1,
  iteration: 1,
  phase: 'PLANNING',
  role: 'sprint-orchestrator',
  branch: 'main',
  shaBase: 'abc123',
};

test('MON-01: schemaVersion e estrutura', () => {
  const e = createMonitorEvent('sprint_started', corr);
  assert.equal(e.schemaVersion, MONITOR_SCHEMA_VERSION);
  assert.ok(e.timestamp);
  assert.ok(Object.isFrozen(e));
});

test('MON-02: 10 tipos de eventos', () => {
  assert.equal(MONITOR_EVENT_TYPES.length, 10);
  for (const t of MONITOR_EVENT_TYPES) {
    assert.doesNotThrow(() => createMonitorEvent(t, corr));
  }
});

test('MON-03: correlação obrigatória', () => {
  assert.throws(
    () => createMonitorEvent('sprint_started', { ...corr, sprintId: '' }),
    (err: unknown) => (err as { code?: string }).code === 'INVALID_MONITOR_CORRELATION',
  );
  assert.throws(
    () => createMonitorEvent('sprint_started', { ...corr, branch: '' }),
    (err: unknown) => (err as { code?: string }).code === 'INVALID_MONITOR_CORRELATION',
  );
});

test('MON-04: redação de segredos', () => {
  const e = createMonitorEvent('gate_result', corr, { token: 'secret123', cmd: 'npm test' });
  assert.ok(!JSON.stringify(e).includes('secret123'));
});
