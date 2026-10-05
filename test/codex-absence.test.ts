import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir: string, skip: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (skip.has(e)) continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, skip));
    else out.push(full);
  }
  return out;
}

const skipDirs = new Set(['node_modules', '.git', 'dist', 'coverage']);

test('CODX-03: nenhum código/pacote/script Codex — scan de conteúdo', () => {
  const files = walk(rootDir, skipDirs);
  for (const f of files) {
    if (f.includes('codex-absence')) continue;
    if (/\.(ts|js|mjs)$/.test(f)) {
      const content = readFileSync(f, 'utf8').toLowerCase();
      assert.ok(!content.includes('codex-sdk'), `Codex SDK found in ${f}`);
      assert.ok(!content.includes('@openai/codex'), `OpenAI Codex package found in ${f}`);
    }
  }
});

test('CODX-03: nenhum código/pacote/script Codex — scan de caminhos', () => {
  const codeDirs = [join(rootDir, 'src'), join(rootDir, 'test')];
  for (const dir of codeDirs) {
    const files = walk(dir, skipDirs);
    for (const f of files) {
      if (f.includes('codex-absence')) continue;
      const rel = relative(rootDir, f);
      assert.ok(!/codex/i.test(rel), `Codex-named code file found: ${rel}`);
    }
  }
});

test('CODX-03: nenhum código/pacote/script Codex — scan de package.json', () => {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const dep of Object.keys(allDeps)) {
    assert.ok(!/codex/i.test(dep), `Codex dependency found in package.json: ${dep}`);
  }
  for (const script of Object.values(pkg.scripts ?? {})) {
    assert.ok(!/codex/i.test(String(script)), `Codex script found in package.json`);
  }
});
