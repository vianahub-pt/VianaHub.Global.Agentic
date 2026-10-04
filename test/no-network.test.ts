import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

const NETWORK_BARE_MODULES: readonly string[] = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dns',
  'dgram',
  'inspector',
];

const NETWORK_THIRD_PARTY_MODULES: readonly string[] = [
  'undici',
  'axios',
  'node-fetch',
  'got',
  'request',
];

function isNetworkModule(specifier: string): boolean {
  const normalized = specifier.trim().toLowerCase();
  const base =
    (normalized.startsWith('node:') ? normalized.slice('node:'.length) : normalized).split(
      '/',
    )[0] ?? '';
  return NETWORK_BARE_MODULES.includes(base) || NETWORK_THIRD_PARTY_MODULES.includes(base);
}

// Captura imports estáticos (ESM) e chamadas require()/import() dinâmicas.
const IMPORT_OR_REQUIRE_RE =
  /(?:import(?:\s+[\w*{}\s,]+from\s+|\s+)['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

function removeComments(content: string): string {
  return content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

test('TST-05: nenhum import de rede em src/ e test/', () => {
  const skip = new Set(['node_modules', '.git', 'dist', 'coverage']);
  const srcDir = join(rootDir, 'src');
  const testDir = join(rootDir, 'test');
  const files = [...walk(srcDir, skip), ...walk(testDir, skip)];
  for (const f of files) {
    if (f.includes('no-network')) continue;
    const code = removeComments(readFileSync(f, 'utf8'));
    const lines = code.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      for (const match of line.matchAll(IMPORT_OR_REQUIRE_RE)) {
        const specifier = (match[1] ?? match[2] ?? '').trim();
        assert.ok(
          !isNetworkModule(specifier),
          `Import de rede detectado em ${f}:${index + 1}: '${specifier}'`,
        );
      }
    }
  }
});
