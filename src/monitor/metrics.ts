import type { MonitorEvent, Severity, GateVerdict } from '../core/types.ts';

export interface MonitorMetrics {
  cycleCount: number;
  gateVerdicts: Record<GateVerdict, number>;
  findingsBySeverity: Record<Severity, number>;
  firstTimestamp: string | null;
  terminalTimestamp: string | null;
  phaseDurationsMs: Record<string, number>;
  timeToTerminalMs: number | null;
}

export function computeMetrics(events: readonly MonitorEvent[]): MonitorMetrics {
  const cycles = new Set<number>();
  const gateVerdicts: Record<GateVerdict, number> = { PASS: 0, FAIL: 0, UNAVAILABLE: 0 };
  const findingsBySeverity: Record<Severity, number> = {
    BLOCKER: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  const phaseDurationsMs: Record<string, number> = {};
  const phaseFirstMs: Record<string, number> = {};
  const phaseLastMs: Record<string, number> = {};
  let firstTimestamp: string | null = null;
  let terminalTimestamp: string | null = null;

  for (const e of events) {
    cycles.add(e.cycle);
    if (firstTimestamp === null) firstTimestamp = e.timestamp;
    if (e.type === 'gate_result') {
      const v = e.payload?.verdict as GateVerdict | undefined;
      if (v === 'PASS' || v === 'FAIL' || v === 'UNAVAILABLE') gateVerdicts[v]++;
    }
    if (e.type === 'finding_recorded') {
      const s = e.payload?.severity as Severity | undefined;
      if (s === 'BLOCKER' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW' || s === 'INFO') {
        findingsBySeverity[s]++;
      }
    }
    if (e.type === 'terminal_state' && terminalTimestamp === null) terminalTimestamp = e.timestamp;
    const p = e.phase;
    if (p) {
      const ms = new Date(e.timestamp).getTime();
      if (!(p in phaseFirstMs)) phaseFirstMs[p] = ms;
      phaseLastMs[p] = ms;
    }
  }

  for (const phase of Object.keys(phaseLastMs)) {
    const first = phaseFirstMs[phase];
    const last = phaseLastMs[phase];
    if (first !== undefined && last !== undefined) {
      phaseDurationsMs[phase] = Math.max(0, last - first);
    }
  }

  const timeToTerminalMs =
    firstTimestamp && terminalTimestamp
      ? new Date(terminalTimestamp).getTime() - new Date(firstTimestamp).getTime()
      : null;

  return {
    cycleCount: cycles.size,
    gateVerdicts,
    findingsBySeverity,
    firstTimestamp,
    terminalTimestamp,
    phaseDurationsMs,
    timeToTerminalMs,
  };
}
