import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

function readRepositoryText(relativePath: string): string {
  return readFileSync(new URL(relativePath, repositoryRoot), 'utf8');
}

test('package.json declara os scripts de gate da toolchain', () => {
  const packageJson = JSON.parse(readRepositoryText('package.json')) as {
    scripts?: Record<string, string>;
  };

  const declaredGateScripts = [
    'whitespace',
    'format:check',
    'lint',
    'typecheck',
    'test',
    'test:coverage',
    'build',
    'audit',
  ];

  for (const scriptName of declaredGateScripts) {
    assert.ok(
      packageJson.scripts?.[scriptName],
      `script de gate ausente em package.json: ${scriptName}`,
    );
  }
});

test('AGENTS.md declara o test runner e preserva os tokens de protocolo', () => {
  const agentsFile = readRepositoryText('AGENTS.md');

  assert.match(agentsFile, /npm test/, 'comando do test runner não declarado em AGENTS.md');
  assert.match(agentsFile, /npm run test:coverage/, 'gate de coverage não declarado em AGENTS.md');
  assert.match(agentsFile, /git diff --check/, 'gate de whitespace não declarado em AGENTS.md');
  assert.match(agentsFile, /NO_TEST_RUNNER_DECLARED/, 'token de protocolo ausente em AGENTS.md');
  assert.match(agentsFile, /READY_FOR_HUMAN_REVIEW/, 'token de protocolo ausente em AGENTS.md');
});
