import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = process.cwd();
const guardDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(repositoryRoot, 'src');
const summaryPath = join(repositoryRoot, 'coverage', 'coverage-summary.json');
const c8Entrypoint = join(guardDirectory, '..', 'node_modules', 'c8', 'bin', 'c8.js');
const statementsThreshold = 80;

function listProductModules(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const modules = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      modules.push(...listProductModules(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      modules.push(entryPath);
    }
  }

  return modules;
}

const productModules = listProductModules(sourceRoot);

if (productModules.length === 0) {
  console.log('[coverage] COVERAGE_UNIVERSE_EMPTY: nenhum modulo de produto em src/**/*.ts.');
  console.log('[coverage] Este resultado NAO constitui evidencia de cobertura de produto.');
  console.log('[coverage] TST-04 (>= 80% statements) so pode ser verificada quando src/ existir.');
  process.exit(0);
}

rmSync(summaryPath, { force: true });

const c8Arguments = [
  '--all',
  '--include=src/**/*.ts',
  '--exclude=**/*.d.ts',
  `--statements=${statementsThreshold}`,
  `--branches=${statementsThreshold}`,
  `--functions=${statementsThreshold}`,
  `--lines=${statementsThreshold}`,
  '--check-coverage',
  '--reporter=text',
  '--reporter=json-summary',
  '--report-dir=coverage',
  'node',
  '--test',
  'test/**/*.test.ts',
];

const c8Run = spawnSync(process.execPath, [c8Entrypoint, ...c8Arguments], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

if (c8Run.status !== 0) {
  console.error(
    `[coverage] FAIL (fail-closed): c8 encerrou com exit ${c8Run.status} ` +
      `ou falhou o threshold de statements >= ${statementsThreshold}%.`,
  );
  process.exit(c8Run.status ?? 1);
}

if (!existsSync(summaryPath)) {
  console.error('[coverage] FAIL (fail-closed): coverage-summary.json nao foi gerado.');
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const reportedModules = new Set(Object.keys(summary).filter((key) => key !== 'total'));
const missingModules = productModules.filter((modulePath) => !reportedModules.has(modulePath));

if (missingModules.length > 0) {
  console.error(
    '[coverage] FAIL (fail-closed): modulo(s) de src/ ausente(s) do universo de cobertura: ' +
      missingModules.join(', '),
  );
  process.exit(1);
}

const statements = summary.total.statements;

console.log(
  `[coverage] statements=${statements.pct}% ` +
    `(${statements.covered}/${statements.total}), threshold=${statementsThreshold}%, ` +
    `universo=${productModules.length} modulo(s) de src/ (inclui nao importados via --all).`,
);
