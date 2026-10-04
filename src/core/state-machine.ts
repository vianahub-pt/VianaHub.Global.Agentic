// CORE-04, CORE-05, LOOP-01, LOOP-02 — Máquina de estados do loop de Sprint.
// Estados terminais não transicionam; qualquer transição fora da tabela é fail-closed.
import {
  PHASES,
  TERMINAL_STATES,
  isLoopState,
  isTerminalState,
  type LoopState,
  type TerminalState,
} from './types.ts';
import { InvalidTransitionError, UnknownStateError } from './errors.ts';

export const NON_TERMINAL_STATES = ['NOT_STARTED', ...PHASES] as const;

export type NonTerminalState = (typeof NON_TERMINAL_STATES)[number];

// RV-01 — Parada fail-closed: todo estado não terminal alcança BLOCKED_NEEDS_HUMAN,
// expressando checkpoint incompatível/contradição no PREFLIGHT, NO_TEST_RUNNER_DECLARED
// detectado em TESTING/GATE_RUN e qualquer falha crítica que exija parada em qualquer fase.
export const FAIL_CLOSED_STOP: TerminalState = 'BLOCKED_NEEDS_HUMAN';

export const TRANSITIONS: Readonly<Record<NonTerminalState, readonly LoopState[]>> = {
  NOT_STARTED: ['PREFLIGHT', FAIL_CLOSED_STOP],
  PREFLIGHT: ['PLANNING', FAIL_CLOSED_STOP],
  PLANNING: ['IMPLEMENTING', FAIL_CLOSED_STOP],
  IMPLEMENTING: ['TESTING', FAIL_CLOSED_STOP],
  TESTING: ['GATE_RUN', 'REMEDIATING', FAIL_CLOSED_STOP],
  GATE_RUN: ['REVIEWING', 'REMEDIATING', ...TERMINAL_STATES],
  // RV-02 — REVIEWING não volta para IMPLEMENTING: início de novo ciclo somente a partir
  // de REMEDIATING (ou GATE_RUN com findings/critérios pendentes).
  REVIEWING: ['REMEDIATING', ...TERMINAL_STATES],
  REMEDIATING: ['IMPLEMENTING', ...TERMINAL_STATES],
};

export const SUCCESS_TERMINAL: TerminalState = 'READY_FOR_HUMAN_REVIEW';

export function assertKnownState(state: string): void {
  if (!isLoopState(state)) {
    throw new UnknownStateError(state);
  }
}

export function isNonTerminal(state: LoopState): state is NonTerminalState {
  return !isTerminalState(state);
}

export function isTerminal(state: LoopState): state is TerminalState {
  return isTerminalState(state);
}

export function isSuccessTerminal(state: LoopState): boolean {
  return state === SUCCESS_TERMINAL;
}

export function transition(from: LoopState, to: LoopState): LoopState {
  assertKnownState(from);
  assertKnownState(to);
  if (isTerminalState(from)) {
    throw new InvalidTransitionError(from, to);
  }
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
