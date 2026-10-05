// CORE-03 — Tipos canônicos do Core (vendor-neutral, TS estrito, sem enum).
import type { NonEmptyString } from './ports.ts';

export const ROLES = [
  'sprint-orchestrator',
  'sprint-architect',
  'sprint-implementer',
  'sprint-tester',
  'sprint-security',
  'sprint-reviewer',
] as const;

export type Role = (typeof ROLES)[number];

export const PHASES = [
  'PREFLIGHT',
  'PLANNING',
  'IMPLEMENTING',
  'TESTING',
  'GATE_RUN',
  'REVIEWING',
  'REMEDIATING',
] as const;

export type Phase = (typeof PHASES)[number];

export const TERMINAL_STATES = [
  'READY_FOR_HUMAN_REVIEW',
  'BLOCKED_NEEDS_HUMAN',
  'MAX_ITERATIONS_REACHED',
  'FAILED_QUALITY_GATES',
] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];

export const LOOP_STATES = ['NOT_STARTED', ...PHASES, ...TERMINAL_STATES] as const;

export type LoopState = (typeof LOOP_STATES)[number];

export const GATE_IDS = [
  'whitespace',
  'format',
  'lint',
  'typecheck',
  'test',
  'coverage',
  'build',
  'audit',
] as const;

export type GateId = (typeof GATE_IDS)[number];

export const SEVERITIES = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

export type Severity = (typeof SEVERITIES)[number];

export type GateVerdict = 'PASS' | 'FAIL' | 'UNAVAILABLE';

export interface GateResult {
  gateId: GateId;
  command: string;
  exitCode: number;
  durationMs: number;
  verdict: GateVerdict;
  stdout: string;
  stderr: string;
  reason: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  criterionId?: string;
}

export interface JournalEntry {
  schemaVersion: string;
  sprint: string;
  cycle: number;
  iteration: number;
  phase: Phase;
  role: Role;
  action: string;
  result: string;
  timestamp: string;
  branch: string;
  shaBase: string;
}

export interface MonitorEvent {
  schemaVersion: string;
  type: string;
  timestamp: string;
  sprintId: string;
  cycle: number;
  iteration: number;
  phase: Phase;
  role: Role;
  branch: string;
  shaBase: string;
  payload: Record<string, unknown>;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

export function isTerminalState(value: unknown): value is TerminalState {
  return typeof value === 'string' && (TERMINAL_STATES as readonly string[]).includes(value);
}

export function isLoopState(value: unknown): value is LoopState {
  return typeof value === 'string' && (LOOP_STATES as readonly string[]).includes(value);
}

export function isGateId(value: unknown): value is GateId {
  return typeof value === 'string' && (GATE_IDS as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

/** Converte `value` em `NonEmptyString`, falhando fechado para vazio/branco (SEC-03). */
export function toNonEmptyString(value: string): NonEmptyString {
  if (value.trim() === '') {
    throw new Error(`Comando vazio: ${JSON.stringify(value)} (fail-closed).`);
  }
  return value as NonEmptyString;
}
