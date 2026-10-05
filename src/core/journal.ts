// LOOP-08, CORE-09 — Journal append-only tipado, imutável após gravação e redigido.
// Toda entrada é validada, redigida e congelada antes de entrar no sink; escrita é somente acréscimo.
import fs from 'node:fs';
import { DomainError } from './errors.ts';
import { resolveContainedPath, type PathSecurityLabels } from './path-security.ts';
import { redact } from './redact.ts';
import { isPhase, isRole, type JournalEntry } from './types.ts';
import type { JournalSink } from './ports.ts';

export const JOURNAL_SCHEMA_VERSION = '1';

export class InvalidJournalEntryError extends DomainError {
  public readonly field: string;

  constructor(field: string) {
    super(
      'INVALID_JOURNAL_ENTRY',
      `Entrada de journal inválida: campo '${field}' ausente ou fora do formato (fail-closed).`,
    );
    this.field = field;
  }
}

export class JournalParseError extends DomainError {
  public readonly line: number;

  constructor(line: number) {
    super('JOURNAL_PARSE_ERROR', `Linha ${line} do journal não interpretável (fail-closed).`);
    this.line = line;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function findInvalidField(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'entry';
  }
  const record = value as Record<string, unknown>;
  if (record['schemaVersion'] !== JOURNAL_SCHEMA_VERSION) {
    return 'schemaVersion';
  }
  if (!isNonEmptyString(record['sprint'])) {
    return 'sprint';
  }
  if (!isPositiveInteger(record['cycle'])) {
    return 'cycle';
  }
  if (!isPositiveInteger(record['iteration'])) {
    return 'iteration';
  }
  if (!isPhase(record['phase'])) {
    return 'phase';
  }
  if (!isRole(record['role'])) {
    return 'role';
  }
  if (!isNonEmptyString(record['action'])) {
    return 'action';
  }
  if (!isNonEmptyString(record['result'])) {
    return 'result';
  }
  if (!isNonEmptyString(record['timestamp'])) {
    return 'timestamp';
  }
  if (!isNonEmptyString(record['branch'])) {
    return 'branch';
  }
  if (!isNonEmptyString(record['shaBase'])) {
    return 'shaBase';
  }
  return null;
}

export function isJournalEntry(value: unknown): value is JournalEntry {
  return findInvalidField(value) === null;
}

export function assertValidJournalEntry(value: unknown): JournalEntry {
  const invalidField = findInvalidField(value);
  if (invalidField !== null) {
    throw new InvalidJournalEntryError(invalidField);
  }
  return value as JournalEntry;
}

function redactEntry(entry: JournalEntry): JournalEntry {
  return {
    schemaVersion: redact(entry.schemaVersion),
    sprint: redact(entry.sprint),
    cycle: entry.cycle,
    iteration: entry.iteration,
    phase: entry.phase,
    role: entry.role,
    action: redact(entry.action),
    result: redact(entry.result),
    timestamp: redact(entry.timestamp),
    branch: redact(entry.branch),
    shaBase: redact(entry.shaBase),
  };
}

/** Valida, redige e congela uma entrada antes de qualquer persistência (fail-closed). */
export function prepareJournalEntry(value: unknown): JournalEntry {
  const entry = assertValidJournalEntry(value);
  return Object.freeze(redactEntry(entry));
}

export class MemoryJournalSink implements JournalSink {
  private readonly entries: JournalEntry[] = [];

  append(entry: JournalEntry): void {
    this.entries.push(prepareJournalEntry(entry));
  }

  readAll(): readonly JournalEntry[] {
    return Object.freeze([...this.entries]);
  }
}

const journalPathLabels = {
  nullByte: ['JOURNAL_PATH_DENIED', 'Caminho do journal contém byte nulo (fail-closed).'],
  rootInaccessible: [
    'JOURNAL_PATH_DENIED',
    'Raiz autorizada do journal inacessível (fail-closed).',
  ],
  indeterminate: ['JOURNAL_PATH_DENIED', 'Caminho físico do journal indeterminável (fail-closed).'],
  circular: ['JOURNAL_PATH_DENIED', 'Symlink circular no caminho do journal (fail-closed).'],
  denied: ['JOURNAL_PATH_DENIED', 'Caminho do journal fora da raiz autorizada (fail-closed).'],
} as const satisfies PathSecurityLabels;

export class FileJournalSink implements JournalSink {
  private readonly filePath: string;
  private readonly rootDir: string;

  /** `rootDir` é a raiz autorizada (injetável); caminhos que escapam dela são negados. */
  constructor(filePath: string, rootDir: string) {
    if (!isNonEmptyString(filePath)) {
      throw new DomainError('INVALID_JOURNAL_PATH', 'Caminho do journal vazio (fail-closed).');
    }
    if (!isNonEmptyString(rootDir)) {
      throw new DomainError(
        'INVALID_JOURNAL_ROOT',
        'Raiz autorizada do journal vazia (fail-closed).',
      );
    }
    this.filePath = filePath;
    this.rootDir = rootDir;
    // Valida já na construção (fail-closed): symlink de escape é negado antes de qualquer uso.
    resolveContainedPath(filePath, rootDir, journalPathLabels);
  }

  append(entry: JournalEntry): void {
    const target = this.resolveTarget();
    const prepared = prepareJournalEntry(entry);
    fs.appendFileSync(target, `${JSON.stringify(prepared)}\n`, 'utf8');
  }

  readAll(): readonly JournalEntry[] {
    const target = this.resolveTarget();
    if (!fs.existsSync(target)) {
      return Object.freeze([]);
    }
    const raw = fs.readFileSync(target, 'utf8');
    const entries: JournalEntry[] = [];
    let lineNumber = 0;
    for (const line of raw.split('\n')) {
      lineNumber += 1;
      if (line.trim() === '') {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new JournalParseError(lineNumber);
      }
      entries.push(prepareJournalEntry(parsed));
    }
    return Object.freeze(entries);
  }

  // Revalida a cada acesso: trocar o alvo por symlink após a construção não escapa da raiz.
  private resolveTarget(): string {
    return resolveContainedPath(this.filePath, this.rootDir, journalPathLabels);
  }
}
