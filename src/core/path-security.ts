// SEC-00 — Contenção de caminho dupla (léxica + física) reutilizável entre sinks.
// Um symlink dentro da raiz apontando para fora passa na checagem léxica,
// mas é negado na checagem física com realpathSync.
import fs from 'node:fs';
import path from 'node:path';
import { DomainError } from './errors.ts';

export type PathSecurityLabels = Readonly<{
  nullByte: readonly [code: string, message: string];
  rootInaccessible: readonly [code: string, message: string];
  indeterminate: readonly [code: string, message: string];
  circular: readonly [code: string, message: string];
  denied: readonly [code: string, message: string];
}>;

function assertWithinRoot(target: string, root: string): void {
  const relative = path.relative(root, target);
  const escapesRoot =
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    relative.startsWith('../') ||
    path.isAbsolute(relative);
  if (escapesRoot) {
    throw new Error('PATH_ESCAPE');
  }
}

function isSymlink(target: string): boolean | null {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return null;
  }
}

/**
 * Resolve o caminho físico (realpath) do alvo seguindo symlinks, inclusive links pendentes
 * (dangling), cujo alvo textual é resolvido antes de qualquer comparação de contenção.
 */
function resolvePhysicalPath(target: string): string {
  const tail: string[] = [];
  const visited = new Set<string>();
  let current = target;
  for (;;) {
    const linkState = isSymlink(current);
    if (linkState === null) {
      // Não existe (nem como symlink pendente): sobe ao pai e preserva o nome do componente.
      tail.push(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error('PATH_INDETERMINATE');
      }
      current = parent;
      continue;
    }
    if (linkState) {
      if (visited.has(current)) {
        throw new Error('PATH_CIRCULAR');
      }
      visited.add(current);
      current = path.resolve(path.dirname(current), fs.readlinkSync(current));
      continue;
    }
    try {
      const real = fs.realpathSync(current);
      return tail.length === 0 ? real : path.join(real, ...tail.reverse());
    } catch {
      throw new Error('PATH_INDETERMINATE');
    }
  }
}

/**
 * Contenção dupla (fail-closed): léxica (path.resolve/path.relative) e física
 * (realpathSync da raiz e do alvo).
 */
export function resolveContainedPath(
  filePath: string,
  rootDir: string,
  labels: PathSecurityLabels,
): string {
  if (filePath.includes('\0') || rootDir.includes('\0')) {
    throw new DomainError(...labels.nullByte);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, filePath);
  try {
    assertWithinRoot(resolved, root);
  } catch {
    throw new DomainError(...labels.denied);
  }
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    throw new DomainError(...labels.rootInaccessible);
  }
  let realTarget: string;
  try {
    realTarget = resolvePhysicalPath(resolved);
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'PATH_CIRCULAR') {
      throw new DomainError(...labels.circular);
    }
    throw new DomainError(...labels.indeterminate);
  }
  try {
    assertWithinRoot(realTarget, realRoot);
  } catch {
    throw new DomainError(...labels.denied);
  }
  return realTarget;
}
