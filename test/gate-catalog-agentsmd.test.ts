import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GATE_CATALOG } from '../src/core/gates.ts';
import { nodeTypescriptProfile } from '../src/profile/node-typescript.profile.ts';

const root = new URL('../', import.meta.url);
function readText(p: string): string {
  return readFileSync(new URL(p, root), 'utf8');
}

const OFFICIAL = [
  'git diff --check',
  'npm run format:check',
  'npm run lint',
  'npm run typecheck',
  'npm test',
  'npm run test:coverage',
  'npm run build',
  'npm run audit',
];

test('GATE-08: AGENTS.md declara os 8 gates', () => {
  const md = readText('AGENTS.md');
  for (const c of OFFICIAL) assert.ok(md.includes('`' + c + '`'), 'missing: ' + c);
});

test('GATE-08: GATE_CATALOG tem 8 gates', () => {
  assert.equal(GATE_CATALOG.length, 8);
});

test('GATE-08: perfil corresponde ao AGENTS.md', () => {
  for (const gate of GATE_CATALOG) {
    const cmd = nodeTypescriptProfile.commands[gate.id];
    assert.ok(cmd, 'missing cmd for ' + String(gate.id));
    assert.ok(OFFICIAL.includes(String(cmd)), 'not in AGENTS.md: ' + String(cmd));
  }
});
