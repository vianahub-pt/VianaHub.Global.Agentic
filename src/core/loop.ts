// LOOP-03, LOOP-04, LOOP-06, LOOP-07, LOOP-09, LOOP-10 — Motor do loop de Sprint (fail-closed).
// Limite de ciclos, FINAL_REMEDIATION, retomada por checkpoint, contradições, condições
// exclusivas de sucesso e evidência obrigatória por estado terminal.
import { CriterionEvidenceError, DomainError } from './errors.ts';
import {
  GATE_IDS,
  isSeverity,
  isTerminalState,
  type Finding,
  type GateResult,
  type JournalEntry,
  type LoopState,
  type Phase,
  type TerminalState,
} from './types.ts';
import { FAIL_CLOSED_STOP, SUCCESS_TERMINAL } from './state-machine.ts';
import type { JournalSink } from './ports.ts';
import { JOURNAL_SCHEMA_VERSION } from './journal.ts';
import {
  evaluateCheckpoint,
  type LoopStateDocument,
  type WorkingTreeSnapshot,
} from './loop-state.ts';

// LOOP-03 — máximo de 5 ciclos por execução.
export const MAX_CYCLES = 5;

// LOOP-04 — FINAL_REMEDIATION limitado a 2 rounds, sempre extensão do ciclo 5.
export const MAX_FINAL_REMEDIATION_ROUNDS = 2;

export interface LoopPosition {
  readonly cycle: number;
  readonly iteration: number;
  readonly finalRemediationRound: number;
  readonly state: LoopState;
}

export type LoopDecision =
  | { readonly kind: 'CONTINUE'; readonly position: LoopPosition }
  | { readonly kind: 'TERMINAL'; readonly state: TerminalState; readonly reason: string };

export function initialPosition(): LoopPosition {
  return Object.freeze({ cycle: 1, iteration: 1, finalRemediationRound: 0, state: 'NOT_STARTED' });
}

function invalidField(code: string, message: string): DomainError {
  return new DomainError(code, `${message} (fail-closed).`);
}

// LOOP-03 — ciclo 6 (ou superior) nunca entra em execução: MAX_ITERATIONS_REACHED.
export function enterCycle(cycle: number, iteration = 1): LoopDecision {
  if (!Number.isInteger(cycle) || cycle < 1) {
    throw invalidField('INVALID_CYCLE', `ciclo inválido: ${String(cycle)}`);
  }
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw invalidField('INVALID_ITERATION', `iteração inválida: ${String(iteration)}`);
  }
  if (cycle > MAX_CYCLES) {
    return {
      kind: 'TERMINAL',
      state: 'MAX_ITERATIONS_REACHED',
      reason: `ciclo ${cycle} excede o limite máximo de ${MAX_CYCLES} ciclos`,
    };
  }
  return Object.freeze({
    kind: 'CONTINUE',
    position: Object.freeze({ cycle, iteration, finalRemediationRound: 0, state: 'PREFLIGHT' }),
  });
}

export function requestNextCycle(position: LoopPosition): LoopDecision {
  return enterCycle(position.cycle + 1, 1);
}

// LOOP-04 — FINAL_REMEDIATION: máx. 2 rounds, extensão exclusiva do ciclo 5 (nunca ciclo 6).
export function requestFinalRemediationRound(position: LoopPosition): LoopDecision {
  if (position.cycle !== MAX_CYCLES) {
    throw invalidField(
      'INVALID_FINAL_REMEDIATION_CYCLE',
      `FINAL_REMEDIATION é extensão exclusiva do ciclo ${MAX_CYCLES}; ciclo atual: ${position.cycle}`,
    );
  }
  const round = position.finalRemediationRound + 1;
  if (round > MAX_FINAL_REMEDIATION_ROUNDS) {
    return {
      kind: 'TERMINAL',
      state: 'MAX_ITERATIONS_REACHED',
      reason:
        `FINAL_REMEDIATION limitado a ${MAX_FINAL_REMEDIATION_ROUNDS} rounds; round ${round} ` +
        `proibido (o ciclo permanece ${MAX_CYCLES}, nunca ciclo 6)`,
    };
  }
  return Object.freeze({
    kind: 'CONTINUE',
    position: Object.freeze({
      cycle: position.cycle,
      iteration: position.iteration,
      finalRemediationRound: round,
      state: 'REMEDIATING',
    }),
  });
}

export interface LoopReality {
  readonly workingTree: WorkingTreeSnapshot;
  readonly pendingCriteria: readonly string[];
  readonly externalChanges: readonly string[];
}

const LOOP_STATE_FILE = 'loop-state.md';

function isLoopStateArtifact(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] === LOOP_STATE_FILE;
}

// LOOP-07 — contradição entre loop-state e working tree/spec/evidências.
// A mudança do próprio loop-state.md é válida e não conta como trabalho externo.
export function detectContradictions(
  document: LoopStateDocument,
  reality: LoopReality,
): readonly string[] {
  const contradictions: string[] = [];
  if (document.branch !== reality.workingTree.branch) {
    contradictions.push(
      `branch divergente ('${document.branch}' × '${reality.workingTree.branch}')`,
    );
  }
  if (document.shaBase !== reality.workingTree.shaBase) {
    contradictions.push(
      `SHA-base divergente ('${document.shaBase}' × '${reality.workingTree.shaBase}')`,
    );
  }
  if (document.cycle > MAX_CYCLES || document.cycle < 1 || document.iteration < 1) {
    contradictions.push(
      `posição impossível (ciclo ${document.cycle}, iteração ${document.iteration})`,
    );
  }
  if (document.status === SUCCESS_TERMINAL && reality.pendingCriteria.length > 0) {
    contradictions.push(
      `loop-state afirma ${SUCCESS_TERMINAL} com ${reality.pendingCriteria.length} critério(s) pendente(s)`,
    );
  }
  const unexpected = reality.externalChanges.filter((change) => {
    return !isLoopStateArtifact(change);
  });
  if (unexpected.length > 0) {
    contradictions.push(`trabalho externo inesperado: ${unexpected.join(', ')}`);
  }
  return Object.freeze(contradictions);
}

// LOOP-06 — retomada por checkpoint compatível (branch + SHA-base); incompatível/contradição
// resulta em BLOCKED_NEEDS_HUMAN, nunca em avanço silencioso.
export function resumeLoop(document: LoopStateDocument, reality: LoopReality): LoopDecision {
  const checkpoint = evaluateCheckpoint(document, reality.workingTree);
  if (!checkpoint.compatible) {
    return { kind: 'TERMINAL', state: checkpoint.stop, reason: checkpoint.reason };
  }
  const contradictions = detectContradictions(document, reality);
  if (contradictions.length > 0) {
    return {
      kind: 'TERMINAL',
      state: FAIL_CLOSED_STOP,
      reason: `contradição entre loop-state e working tree/evidências: ${contradictions.join('; ')}`,
    };
  }
  if (isTerminalState(document.status)) {
    return {
      kind: 'TERMINAL',
      state: document.status,
      reason: 'checkpoint retomado em estado terminal consistente',
    };
  }
  return Object.freeze({
    kind: 'CONTINUE',
    position: Object.freeze({
      cycle: document.cycle,
      iteration: document.iteration,
      finalRemediationRound: document.finalRemediationRound,
      state: document.status,
    }),
  });
}

// LOOP-09 — as 6 condições exclusivas de sucesso (todas obrigatórias, verificáveis uma a uma).
export const SUCCESS_CONDITION_IDS = [
  'criteriaComplete',
  'evidencePerCriterion',
  'gatesAndTestsPass',
  'documentationComplete',
  'noBlockingFindings',
  'loopStateComplete',
] as const;

export type SuccessConditionId = (typeof SUCCESS_CONDITION_IDS)[number];

export interface CriterionRecord {
  readonly criterionId: string;
  readonly completed: boolean;
  readonly evidence: string;
}

export interface TestEvidence {
  readonly executed: boolean;
  readonly passed: number;
  readonly failed: number;
}

export interface SprintEvidence {
  readonly criteria: readonly CriterionRecord[];
  readonly gates: readonly GateResult[];
  readonly tests: TestEvidence;
  readonly findings: readonly Finding[];
  readonly documentationComplete: boolean;
  readonly loopStateComplete: boolean;
}

export type SuccessVerdict =
  | { readonly ok: true; readonly met: readonly SuccessConditionId[] }
  | { readonly ok: false; readonly unmet: readonly SuccessConditionId[] };

const BLOCKING_SEVERITIES: readonly string[] = ['BLOCKER', 'HIGH', 'MEDIUM'];

export function evaluateSuccess(evidence: SprintEvidence): SuccessVerdict {
  const unmet: SuccessConditionId[] = [];

  const criteriaComplete =
    evidence.criteria.length > 0 && evidence.criteria.every((criterion) => criterion.completed);
  if (!criteriaComplete) {
    unmet.push('criteriaComplete');
  }

  const evidencePerCriterion =
    evidence.criteria.length > 0 &&
    evidence.criteria.every((criterion) => criterion.evidence.trim() !== '');
  if (!evidencePerCriterion) {
    unmet.push('evidencePerCriterion');
  }

  const coveredGateIds = new Set(evidence.gates.map((gate) => gate.gateId));
  const allGatesCovered = GATE_IDS.every((id) => coveredGateIds.has(id));
  const gatesAndTestsPass =
    evidence.gates.length > 0 &&
    allGatesCovered &&
    evidence.gates.every((gate) => gate.verdict === 'PASS') &&
    evidence.tests.executed &&
    evidence.tests.passed > 0 &&
    evidence.tests.failed === 0;
  if (!gatesAndTestsPass) {
    unmet.push('gatesAndTestsPass');
  }

  if (!evidence.documentationComplete) {
    unmet.push('documentationComplete');
  }

  const hasBlockingFindings = evidence.findings.some((finding) => {
    return BLOCKING_SEVERITIES.includes(finding.severity);
  });
  if (hasBlockingFindings) {
    unmet.push('noBlockingFindings');
  }

  if (!evidence.loopStateComplete) {
    unmet.push('loopStateComplete');
  }

  if (unmet.length > 0) {
    return { ok: false, unmet: Object.freeze([...unmet]) };
  }
  return { ok: true, met: Object.freeze([...SUCCESS_CONDITION_IDS]) };
}

export class SuccessConditionsUnmetError extends DomainError {
  public readonly unmet: readonly string[];

  constructor(unmet: readonly string[]) {
    super(
      'SUCCESS_CONDITIONS_UNMET',
      `Condições exclusivas de sucesso não satisfeitas: ${unmet.join(', ')} ` +
        '(READY_FOR_HUMAN_REVIEW exige as 6 condições — fail-closed).',
    );
    this.unmet = Object.freeze([...unmet]);
  }
}

export function assertReadyForHumanReview(evidence: SprintEvidence): void {
  const verdict = evaluateSuccess(evidence);
  if (!verdict.ok) {
    throw new SuccessConditionsUnmetError(verdict.unmet);
  }
}

export class TerminalEvidenceError extends DomainError {
  public readonly state: string;
  public readonly pillar: string;

  constructor(state: string, pillar: string) {
    super(
      'TERMINAL_EVIDENCE_MISSING',
      `Evidência obrigatória ausente ou inválida ('${pillar}') para o estado terminal ` +
        `'${state}' (fail-closed).`,
    );
    this.state = state;
    this.pillar = pillar;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// LOOP-10 — todo estado terminal exige evidência estruturada (gates, testes, findings,
// cobertura de critérios); ausência ou formato inválido nunca vira sucesso silencioso.
export function assertTerminalEvidence(state: TerminalState, evidence: SprintEvidence): void {
  if (!isTerminalState(state)) {
    throw invalidField('INVALID_TERMINAL_STATE', `estado não terminal: '${String(state)}'`);
  }
  if (!Array.isArray(evidence.gates) || evidence.gates.length === 0) {
    throw new TerminalEvidenceError(state, 'gates');
  }
  for (const gate of evidence.gates) {
    const verdictIsKnown =
      gate.verdict === 'PASS' || gate.verdict === 'FAIL' || gate.verdict === 'UNAVAILABLE';
    if (!verdictIsKnown) {
      throw new TerminalEvidenceError(state, 'gates');
    }
    if (gate.verdict === 'UNAVAILABLE') {
      if (gate.exitCode !== -1 || !isNonEmptyString(gate.reason)) {
        throw new TerminalEvidenceError(state, 'gates');
      }
      continue;
    }
    if (!isNonNegativeInteger(gate.exitCode) || !isNonEmptyString(gate.command)) {
      throw new TerminalEvidenceError(state, 'gates');
    }
  }
  const tests: unknown = evidence.tests;
  if (tests === undefined || tests === null || typeof tests !== 'object') {
    throw new TerminalEvidenceError(state, 'tests');
  }
  const testRecord = tests as { executed?: unknown; passed?: unknown; failed?: unknown };
  if (
    typeof testRecord.executed !== 'boolean' ||
    !isNonNegativeInteger(testRecord.passed) ||
    !isNonNegativeInteger(testRecord.failed)
  ) {
    throw new TerminalEvidenceError(state, 'tests');
  }
  if (!Array.isArray(evidence.findings)) {
    throw new TerminalEvidenceError(state, 'findings');
  }
  for (const finding of evidence.findings) {
    if (!isNonEmptyString(finding.id) || !isSeverity(finding.severity)) {
      throw new TerminalEvidenceError(state, 'findings');
    }
  }
  if (!Array.isArray(evidence.criteria) || evidence.criteria.length === 0) {
    throw new TerminalEvidenceError(state, 'criteriaCoverage');
  }
  for (const criterion of evidence.criteria) {
    if (!isNonEmptyString(criterion.criterionId)) {
      throw new TerminalEvidenceError(state, 'criteriaCoverage');
    }
  }
  if (state === SUCCESS_TERMINAL) {
    for (const criterion of evidence.criteria) {
      if (!criterion.completed || criterion.evidence.trim() === '') {
        throw new CriterionEvidenceError(criterion.criterionId, state);
      }
    }
  }
}

export interface LoopEngineOptions {
  readonly sprint: string;
  readonly branch: string;
  readonly shaBase: string;
  readonly journal: JournalSink;
  readonly now?: () => string;
}

/**
 * Motor do loop: orquestra ciclo/round/retomada/estado terminal sobre as funções puras
 * acima e registra cada decisão no journal (redigido pelo sink, append-only).
 */
export class LoopEngine {
  private readonly sprint: string;
  private readonly branch: string;
  private readonly shaBase: string;
  private readonly journal: JournalSink;
  private readonly now: () => string;
  private position: LoopPosition;

  constructor(options: LoopEngineOptions) {
    if (!isNonEmptyString(options.sprint)) {
      throw invalidField('INVALID_SPRINT', 'identificação de sprint vazia');
    }
    if (!isNonEmptyString(options.branch)) {
      throw invalidField('INVALID_BRANCH', 'branch vazia');
    }
    if (!isNonEmptyString(options.shaBase)) {
      throw invalidField('INVALID_SHA_BASE', 'SHA-base vazia');
    }
    this.sprint = options.sprint;
    this.branch = options.branch;
    this.shaBase = options.shaBase;
    this.journal = options.journal;
    this.now = options.now ?? (() => new Date().toISOString());
    this.position = initialPosition();
  }

  get current(): LoopPosition {
    return this.position;
  }

  enterCycle(cycle: number, iteration = 1): LoopDecision {
    return this.apply('enterCycle', 'PREFLIGHT', enterCycle(cycle, iteration));
  }

  requestNextCycle(): LoopDecision {
    return this.apply('requestNextCycle', 'PREFLIGHT', requestNextCycle(this.position));
  }

  requestFinalRemediationRound(): LoopDecision {
    return this.apply(
      'requestFinalRemediationRound',
      'REMEDIATING',
      requestFinalRemediationRound(this.position),
    );
  }

  resume(document: LoopStateDocument, reality: LoopReality): LoopDecision {
    return this.apply('resume', 'PREFLIGHT', resumeLoop(document, reality));
  }

  finish(state: TerminalState, evidence: SprintEvidence): TerminalState {
    assertTerminalEvidence(state, evidence);
    if (state === SUCCESS_TERMINAL) {
      assertReadyForHumanReview(evidence);
    }
    this.record('finish', 'REVIEWING', {
      kind: 'TERMINAL',
      state,
      reason: `estado terminal '${state}' registrado com evidência`,
    });
    return state;
  }

  private apply(action: string, phase: Phase, decision: LoopDecision): LoopDecision {
    if (decision.kind === 'CONTINUE') {
      this.position = decision.position;
    }
    this.record(action, phase, decision);
    return decision;
  }

  private record(action: string, phase: Phase, decision: LoopDecision): void {
    const result =
      decision.kind === 'TERMINAL'
        ? `${decision.kind}:${decision.state}`
        : `${decision.kind}:${decision.position.state}`;
    const entry: JournalEntry = {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      sprint: this.sprint,
      cycle: this.position.cycle,
      iteration: this.position.iteration,
      phase,
      role: 'sprint-orchestrator',
      action,
      result,
      timestamp: this.now(),
      branch: this.branch,
      shaBase: this.shaBase,
    };
    this.journal.append(entry);
  }
}
