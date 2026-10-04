import { isPhase, isRole, type MonitorEvent, type Phase, type Role } from '../core/types.ts';
import { redactObject } from '../core/redact.ts';
import { DomainError } from '../core/errors.ts';

export const MONITOR_SCHEMA_VERSION = '1' as const;

export const MONITOR_EVENT_TYPES = [
  'sprint_started',
  'sprint_completed',
  'cycle_started',
  'cycle_completed',
  'phase_transition',
  'delegation',
  'gate_result',
  'finding_recorded',
  'criterion_completed',
  'terminal_state',
] as const;
export type MonitorEventType = (typeof MONITOR_EVENT_TYPES)[number];

export interface MonitorCorrelation {
  sprintId: string;
  cycle: number;
  iteration: number;
  phase: string;
  role: string;
  branch: string;
  shaBase: string;
}

function validateCorrelation(
  c: MonitorCorrelation,
): asserts c is MonitorCorrelation & { phase: Phase; role: Role } {
  const required: (keyof MonitorCorrelation)[] = [
    'sprintId',
    'cycle',
    'iteration',
    'phase',
    'role',
    'branch',
    'shaBase',
  ];
  for (const k of required) {
    if (c[k] === undefined || c[k] === null || c[k] === '') {
      throw new DomainError('INVALID_MONITOR_CORRELATION', `Missing correlation field: ${k}`);
    }
  }
  if (!isPhase(c.phase)) {
    throw new DomainError('INVALID_MONITOR_CORRELATION', `Invalid phase: ${c.phase}`);
  }
  if (!isRole(c.role)) {
    throw new DomainError('INVALID_MONITOR_CORRELATION', `Invalid role: ${c.role}`);
  }
}

export function createMonitorEvent(
  type: MonitorEventType,
  correlation: MonitorCorrelation,
  payload: Record<string, unknown> = {},
): MonitorEvent {
  if (!MONITOR_EVENT_TYPES.includes(type)) {
    throw new DomainError('UNKNOWN_MONITOR_EVENT_TYPE', `Unknown event type: ${type}`);
  }
  validateCorrelation(correlation);
  const event: MonitorEvent = {
    schemaVersion: MONITOR_SCHEMA_VERSION,
    type,
    timestamp: new Date().toISOString(),
    sprintId: correlation.sprintId,
    cycle: correlation.cycle,
    iteration: correlation.iteration,
    phase: correlation.phase,
    role: correlation.role,
    branch: correlation.branch,
    shaBase: correlation.shaBase,
    payload: redactObject(payload) as Record<string, unknown>,
  };
  return Object.freeze(event);
}
