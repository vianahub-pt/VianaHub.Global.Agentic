// GUARD-07 / MIG-07 — Varredura automatizada anti-migração do domínio Marketing.Ops.
// Espelha os Não-objetivos de docs/sprints/sprint-0/spec.md e o checklist em
// docs/security/marketing-ops-exclusion.md: nenhum caminho, import ou script do domínio
// proibido em src/**, test/** ou package.json. Fail-closed: escopo vazio ou ausente reprova —
// varredura vazia nunca é evidência de exclusão (MIG-07).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Padrões proibidos (comparação por substring, case-insensitive). Nove unidades estáveis,
// tradução executável do checklist de exclusão.
const FORBIDDEN_PATTERNS: readonly string[] = [
  'automation/',
  'brands/',
  'data/',
  'reports/',
  'database/',
  'opsdb',
  'sqlcmd',
  'gerit',
  'gbp',
];

// A varredura declara os padrões proibidos por definição: o conteúdo deste próprio arquivo é a
// única exclusão da checagem de conteúdo/import — exclusão por caminho exato (nunca por padrão),
// e o caminho do arquivo continua verificado normalmente.
const SCANNER_SELF = 'test/anti-migration.test.ts';
const CONTENT_SCAN_EXCLUSIONS: readonly string[] = [SCANNER_SELF];

const SCAN_DIRS: readonly string[] = ['src', 'test'];
const SCAN_ROOT_FILES: readonly string[] = ['package.json'];

interface ScannedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
}

function toPosix(target: string): string {
  return target.split(path.sep).join('/');
}

/** Padrões proibidos presentes em `text` (case-insensitive); lista vazia = sem violação. */
function findForbidden(text: string): string[] {
  const haystack = text.toLowerCase();
  return FORBIDDEN_PATTERNS.filter((pattern) => haystack.includes(pattern));
}

function listFilesRecursively(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

/** Coleta o escopo completo da varredura; escopo ausente reprova (fail-closed). */
function collectScanFiles(): ScannedFile[] {
  const files: ScannedFile[] = [];
  for (const dir of SCAN_DIRS) {
    const absoluteDir = path.join(ROOT, dir);
    assert.ok(
      fs.existsSync(absoluteDir),
      `escopo de varredura ausente (fail-closed): diretório '${dir}'`,
    );
    for (const absolutePath of listFilesRecursively(absoluteDir)) {
      files.push({ relativePath: toPosix(path.relative(ROOT, absolutePath)), absolutePath });
    }
  }
  for (const rootFile of SCAN_ROOT_FILES) {
    const absolutePath = path.join(ROOT, rootFile);
    assert.ok(
      fs.existsSync(absolutePath),
      `escopo de varredura ausente (fail-closed): arquivo '${rootFile}'`,
    );
    files.push({ relativePath: rootFile, absolutePath });
  }
  return files;
}

/** Imports (estáticos, dinâmicos e require) declarados no conteúdo de um módulo. */
function extractImportSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const specifiers: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function readUtf8(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf8');
}

function describeViolations(hits: readonly { file: string; pattern: string }[]): string[] {
  return hits.map((hit) => `${hit.file} (padrão proibido '${hit.pattern}')`);
}

test('GUARD-07: o detector reconhece cada padrão proibido, inclusive variações de caixa', () => {
  const samples: ReadonlyArray<readonly [string, string]> = [
    ['import x from "./automation/orchestrator.ts";', 'automation/'],
    ['src/brands/gerit/market.json', 'brands/'],
    ['fixtures data/seed.json', 'data/'],
    ['node reports/gerit/build.mjs', 'reports/'],
    ['migrations/database/001.sql', 'database/'],
    ['Server=localhost;Database=opsdb', 'opsdb'],
    ['sqlcmd -S localhost -d opsdb', 'sqlcmd'],
    ['reports/GERIT/resumo.md', 'gerit'],
    ['integração GBP (Google Business Profile)', 'gbp'],
  ];
  for (const [sample, expected] of samples) {
    assert.ok(
      findForbidden(sample).includes(expected),
      `padrão '${expected}' não detectado em: ${sample}`,
    );
    assert.ok(
      findForbidden(sample.toUpperCase()).includes(expected),
      `padrão '${expected}' não detectado em variação de caixa: ${sample}`,
    );
    assert.ok(
      findForbidden(sample.toLowerCase()).includes(expected),
      `padrão '${expected}' não detectado em minúsculas: ${sample}`,
    );
  }
  assert.deepEqual(findForbidden('src/core/loop.ts: conteúdo permitido'), []);
  assert.deepEqual(findForbidden('database sem barra final não casa o padrão de diretório'), []);
});

test('GUARD-07: nenhum caminho proibido em src/**, test/** ou package.json', () => {
  const hits: { file: string; pattern: string }[] = [];
  for (const file of collectScanFiles()) {
    for (const pattern of findForbidden(file.relativePath)) {
      hits.push({ file: file.relativePath, pattern });
    }
  }
  assert.deepEqual(describeViolations(hits), []);
});

test('GUARD-07/MIG-07: nenhum import proibido em src/** e test/**', () => {
  const hits: { file: string; pattern: string }[] = [];
  for (const file of collectScanFiles()) {
    if (CONTENT_SCAN_EXCLUSIONS.includes(file.relativePath)) {
      continue;
    }
    if (!file.relativePath.endsWith('.ts') && !file.relativePath.endsWith('.mts')) {
      continue;
    }
    for (const specifier of extractImportSpecifiers(readUtf8(file.absolutePath))) {
      for (const pattern of findForbidden(specifier)) {
        hits.push({ file: `${file.relativePath} -> '${specifier}'`, pattern });
      }
    }
  }
  assert.deepEqual(describeViolations(hits), []);
});

test('GUARD-07/MIG-07: nenhum conteúdo de Marketing.Ops em src/**, test/** ou package.json', () => {
  const hits: { file: string; pattern: string }[] = [];
  for (const file of collectScanFiles()) {
    if (CONTENT_SCAN_EXCLUSIONS.includes(file.relativePath)) {
      continue;
    }
    for (const pattern of findForbidden(readUtf8(file.absolutePath))) {
      hits.push({ file: file.relativePath, pattern });
    }
  }
  assert.deepEqual(describeViolations(hits), []);
});

test('GUARD-07: scripts e dependências de package.json sem domínio proibido', () => {
  const manifestPath = path.join(ROOT, 'package.json');
  const manifest = JSON.parse(readUtf8(manifestPath)) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const hits: { file: string; pattern: string }[] = [];
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    for (const pattern of findForbidden(`${name} ${command}`)) {
      hits.push({ file: `package.json#scripts.${name}`, pattern });
    }
  }
  const dependencyNames = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];
  for (const name of dependencyNames) {
    for (const pattern of findForbidden(name)) {
      hits.push({ file: `package.json#dependencies.${name}`, pattern });
    }
  }
  assert.deepEqual(describeViolations(hits), []);
});

test('GUARD-07: o escopo da varredura é real e a única exclusão é o próprio scanner', () => {
  const files = collectScanFiles();
  const relativePaths = files.map((file) => file.relativePath);

  // Fail-closed: escopo vazio ou incompleto não constitui evidência de exclusão.
  assert.ok(files.length > 2, 'varredura sem arquivos não é evidência (fail-closed)');
  assert.ok(relativePaths.includes('package.json'));
  assert.ok(
    relativePaths.some((relativePath) => relativePath.startsWith('src/')),
    'varredura sem cobertura de src/** (fail-closed)',
  );
  assert.ok(
    relativePaths.some((relativePath) => relativePath.startsWith('test/')),
    'varredura sem cobertura de test/** (fail-closed)',
  );

  // A exclusão de conteúdo é exatamente o arquivo da varredura — nunca um diretório ou glob.
  assert.deepEqual(CONTENT_SCAN_EXCLUSIONS, [SCANNER_SELF]);
  assert.ok(relativePaths.includes(SCANNER_SELF));
  for (const exclusion of CONTENT_SCAN_EXCLUSIONS) {
    assert.ok(
      SCAN_DIRS.some((dir) => exclusion.startsWith(`${dir}/`)),
      `exclusão fora do escopo de varredura: '${exclusion}'`,
    );
  }
});
