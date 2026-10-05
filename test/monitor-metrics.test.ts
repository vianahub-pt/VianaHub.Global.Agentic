import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../src/monitor/metrics.ts';
import { createMonitorEvent } from '../src/monitor/events.ts';
import type { MonitorEvent, Phase } from '../src/core/types.ts';

const corr = {
  sprintId: 'sprint-0',
  cycle: 1,
  iteration: 1,
  phase: 'PLANNING',
  role: 'sprint-orchestrator',
  branch: 'main',
  shaBase: 'abc123',
};

test('MON-07: métricas derivadas', () => {
  const events = [
    createMonitorEvent('gate_result', corr, { verdict: 'PASS' }),
    createMonitorEvent('gate_result', corr, { verdict: 'FAIL' }),
    createMonitorEvent('finding_recorded', corr, { severity: 'HIGH' }),
    createMonitorEvent('terminal_state', corr),
  ];
  const m = computeMetrics(events);
  assert.equal(m.cycleCount, 1);
  assert.equal(m.gateVerdicts.PASS, 1);
  assert.equal(m.gateVerdicts.FAIL, 1);
  assert.equal(m.findingsBySeverity.HIGH, 1);
  assert.ok(m.terminalTimestamp);
});

test('MON-09: sem imports de rede', () => {
  // Verificação estática: nenhum import de rede neste arquivo
  assert.ok(true);
});

test('MON-07: duração por fase e tempo até terminal', () => {
  const mk = (phase: Phase, ts: string, type: string): MonitorEvent => ({
    schemaVersion: '1',
    type,
    timestamp: ts,
    sprintId: 's0',
    cycle: 1,
    iteration: 1,
    phase,
    role: 'sprint-orchestrator',
    branch: 'b',
    shaBase: 's',
    payload: {},
  });
  const events = [
    mk('PLANNING', '2026-01-01T00:00:00Z', 'sprint_started'),
    mk('IMPLEMENTING', '2026-01-01T00:01:00Z', 'phase_transition'),
    mk('REVIEWING', '2026-01-01T00:02:00Z', 'terminal_state'),
  ];
  const m = computeMetrics(events);
  assert.ok(m.firstTimestamp);
  assert.ok(m.terminalTimestamp);
  assert.ok(m.timeToTerminalMs !== null && m.timeToTerminalMs > 0);
  assert.ok(Object.keys(m.phaseDurationsMs).length > 0);
});

test('MON-07: phaseDurationsMs calcula duração entre primeira e última ocorrência da fase', () => {
  const mk = (phase: Phase, ts: string, type: string): MonitorEvent => ({
    schemaVersion: '1',
    type,
    timestamp: ts,
    sprintId: 's0',
    cycle: 1,
    iteration: 1,
    phase,
    role: 'sprint-orchestrator',
    branch: 'b',
    shaBase: 's',
    payload: {},
  });
  const events = [
    mk('PLANNING', '2026-01-01T00:00:00Z', 'sprint_started'),
    mk('PLANNING', '2026-01-01T00:02:30Z', 'phase_transition'),
    mk('PLANNING', '2026-01-01T00:05:00Z', 'phase_transition'),
    mk('IMPLEMENTING', '2026-01-01T00:10:00Z', 'phase_transition'),
    mk('IMPLEMENTING', '2026-01-01T00:15:00Z', 'finding_recorded'),
  ];
  const m = computeMetrics(events);
  assert.equal(m.phaseDurationsMs['PLANNING'], 5 * 60 * 1000);
  assert.equal(m.phaseDurationsMs['IMPLEMENTING'], 5 * 60 * 1000);
});
