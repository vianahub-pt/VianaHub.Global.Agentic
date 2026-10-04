// LOOP-05, LOOP-06 — Persistência de loop-state versionada e checkpoint por branch + SHA-base.
// Serialização/deserialização fail-closed; checkpoint incompatível sinaliza BLOCKED_NEEDS_HUMAN.
import { DomainError } from './errors.ts';
import { isLoopState, type LoopState, type TerminalState } from './types.ts';
import { assertKnownState, FAIL_CLOSED_STOP } from './state-machine.ts';

export { isLoopState, assertKnownState };

export const LOOP_STATE_SCHEMA_VERSION = '1';

export interface LoopStateDocument {
  readonly schemaVersion: string;
  readonly sprintId: string;
  readonly branch: string;
  readonly shaBase: string;
  readonly status: LoopState;
  readonly cycle: number;
  readonly iteration: number;
  readonly finalRemediationRound: number;
}

export interface WorkingTreeSnapshot {
  readonly branch: string;
  readonly shaBase: string;
}

export type CheckpointVerdict =
  | {
      readonly compatible: true;
      readonly resumeFrom: LoopState;
      readonly cycle: number;
      readonly iteration: number;
      readonly finalRemediationRound: number;
    }
  | {
      readonly compatible: false;
      readonly stop: TerminalState;
      readonly reason: string;
    };

export class LoopStateFormatError extends DomainError {
  public readonly field: string;

  constructor(field: string) {
    super(
      'LOOP_STATE_INVALID',
      `loop-state inválido: campo '${field}' ausente ou fora do formato (fail-closed).`,
    );
    this.field = field;
  }
}

export class UnsupportedSchemaVersionError extends DomainError {
  public readonly schemaVersion: string;

  constructor(schemaVersion: string) {
    super(
      'UNSUPPORTED_SCHEMA_VERSION',
      `schemaVersion de loop-state não suportada: '${schemaVersion}' (fail-closed).`,
    );
    this.schemaVersion = schemaVersion;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isLoopStateDocument(value: unknown): value is LoopStateDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record['schemaVersion'] === LOOP_STATE_SCHEMA_VERSION &&
    isNonEmptyString(record['sprintId']) &&
    isNonEmptyString(record['branch']) &&
    isNonEmptyString(record['shaBase']) &&
    isLoopState(record['status']) &&
    isPositiveInteger(record['cycle']) &&
    isPositiveInteger(record['iteration']) &&
    isNonNegativeInteger(record['finalRemediationRound'])
  );
}

export function assertLoopStateDocument(value: unknown): LoopStateDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LoopStateFormatError('document');
  }
  const record = value as Record<string, unknown>;
  const schemaVersion = record['schemaVersion'];
  if (!isNonEmptyString(schemaVersion)) {
    throw new LoopStateFormatError('schemaVersion');
  }
  if (schemaVersion !== LOOP_STATE_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(schemaVersion);
  }
  if (!isNonEmptyString(record['sprintId'])) {
    throw new LoopStateFormatError('sprintId');
  }
  if (!isNonEmptyString(record['branch'])) {
    throw new LoopStateFormatError('branch');
  }
  if (!isNonEmptyString(record['shaBase'])) {
    throw new LoopStateFormatError('shaBase');
  }
  const status = record['status'];
  if (typeof status !== 'string') {
    throw new LoopStateFormatError('status');
  }
  // Fail-closed: estado desconhecido lança UnknownStateError via assertKnownState.
  assertKnownState(status);
  if (!isPositiveInteger(record['cycle'])) {
    throw new LoopStateFormatError('cycle');
  }
  if (!isPositiveInteger(record['iteration'])) {
    throw new LoopStateFormatError('iteration');
  }
  if (!isNonNegativeInteger(record['finalRemediationRound'])) {
    throw new LoopStateFormatError('finalRemediationRound');
  }
  return value as LoopStateDocument;
}

export function serializeLoopState(document: LoopStateDocument): string {
  const valid = assertLoopStateDocument(document);
  return JSON.stringify({
    schemaVersion: valid.schemaVersion,
    sprintId: valid.sprintId,
    branch: valid.branch,
    shaBase: valid.shaBase,
    status: valid.status,
    cycle: valid.cycle,
    iteration: valid.iteration,
    finalRemediationRound: valid.finalRemediationRound,
  });
}

export function deserializeLoopState(raw: string): LoopStateDocument {
  if (!isNonEmptyString(raw)) {
    throw new LoopStateFormatError('payload');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LoopStateFormatError('json');
  }
  return Object.freeze(assertLoopStateDocument(parsed));
}

/**
 * Checkpoint por branch + SHA-base: compatível retoma no próximo passo registrado;
 * incompatível sinaliza BLOCKED_NEEDS_HUMAN (fail-closed, sem avanço silencioso).
 */
export function evaluateCheckpoint(
  document: LoopStateDocument,
  workingTree: WorkingTreeSnapshot,
): CheckpointVerdict {
  const valid = assertLoopStateDocument(document);
  if (valid.branch !== workingTree.branch) {
    return {
      compatible: false,
      stop: FAIL_CLOSED_STOP,
      reason:
        `checkpoint incompatível: branch do loop-state ('${valid.branch}') difere ` +
        `do working tree ('${workingTree.branch}')`,
    };
  }
  if (valid.shaBase !== workingTree.shaBase) {
    return {
      compatible: false,
      stop: FAIL_CLOSED_STOP,
      reason:
        `checkpoint incompatível: SHA-base do loop-state ('${valid.shaBase}') difere ` +
        `do working tree ('${workingTree.shaBase}')`,
    };
  }
  return {
    compatible: true,
    resumeFrom: valid.status,
    cycle: valid.cycle,
    iteration: valid.iteration,
    finalRemediationRound: valid.finalRemediationRound,
  };
}
