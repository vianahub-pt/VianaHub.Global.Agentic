import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MonitorEvent } from '../core/types.ts';
import { DomainError } from '../core/errors.ts';
import { resolveContainedPath, type PathSecurityLabels } from '../core/path-security.ts';
import { redactObject } from '../core/redact.ts';

export class MemoryMonitorSink {
  #events: MonitorEvent[] = [];
  emit(event: MonitorEvent): void {
    const safe = redactObject(event) as MonitorEvent;
    this.#events.push(Object.freeze(safe));
  }
  get events(): readonly MonitorEvent[] {
    return Object.freeze([...this.#events]);
  }
  clear(): void {
    this.#events = [];
  }
}

const monitorPathLabels = {
  nullByte: ['MONITOR_PATH_DENIED', 'Monitor sink path contains null byte (fail-closed).'],
  rootInaccessible: ['MONITOR_PATH_DENIED', 'Monitor sink root inaccessible (fail-closed).'],
  indeterminate: ['MONITOR_PATH_DENIED', 'Monitor sink physical path indeterminate (fail-closed).'],
  circular: ['MONITOR_PATH_DENIED', 'Monitor sink circular symlink (fail-closed).'],
  denied: ['MONITOR_PATH_DENIED', 'Monitor sink must be within workspace'],
} as const satisfies PathSecurityLabels;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export class FileMonitorSink {
  #filePath: string;
  #rootDir: string;

  constructor(filePath: string, rootDir: string) {
    if (!isNonEmptyString(filePath)) {
      throw new DomainError('MONITOR_PATH_DENIED', 'Monitor sink file path empty (fail-closed).');
    }
    if (!isNonEmptyString(rootDir)) {
      throw new DomainError('MONITOR_PATH_DENIED', 'Monitor sink root empty (fail-closed).');
    }
    this.#filePath = filePath;
    this.#rootDir = rootDir;
    // Valida já na construção (fail-closed): resolve contra rootDir e nega symlink de escape.
    const target = resolveContainedPath(filePath, rootDir, monitorPathLabels);
    const dir = dirname(target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  emit(event: MonitorEvent): void {
    // Revalida a cada acesso: trocar o alvo por symlink após a construção não escapa da raiz.
    const target = resolveContainedPath(this.#filePath, this.#rootDir, monitorPathLabels);
    const safe = redactObject(event) as MonitorEvent;
    appendFileSync(target, JSON.stringify(safe) + '\n', 'utf8');
  }
}
