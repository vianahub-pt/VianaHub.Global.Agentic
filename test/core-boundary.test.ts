// CORE-10, CORE-11 — Testes de fronteira do Core: sem vendor e sem dependências externas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CORE_DIR = path.join(process.cwd(), 'src', 'core');
const PACKAGE_JSON = path.join(process.cwd(), 'package.json');

const FORBIDDEN_SPECIFIER_FRAGMENTS = ['adapter', 'profile', 'monitor', 'opencode', 'codex'];

const VENDOR_SDK_NAMES = ['opencode', 'codex', 'openai', 'anthropic'];

function listCoreFiles(): string[] {
  return fs
    .readdirSync(CORE_DIR)
    .filter((entry) => entry.endsWith('.ts'))
    .sort();
}

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) {
        throw new Error(`Especificador não capturado pela regex: ${pattern.source}`);
      }
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function isRelativeCoreSpecifier(specifier: string): boolean {
  return /^\.\.?[\\/]/.test(specifier);
}

test('CORE-10: src/core/ existe e contém arquivos TypeScript', () => {
  assert.ok(fs.existsSync(CORE_DIR));
  const files = listCoreFiles();
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(file.endsWith('.ts'));
  }
});

test('CORE-10: nenhum specifier referencia adapter, profile, monitor ou vendor', () => {
  const files = listCoreFiles();
  for (const file of files) {
    const source = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
    for (const specifier of extractSpecifiers(source)) {
      const lower = specifier.toLowerCase();
      for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
        assert.ok(
          !lower.includes(fragment),
          `${file}: specifier proibido '${fragment}' em '${specifier}'`,
        );
      }
    }
  }
});

test('CORE-10: apenas node:* ou relativos ./x.ts dentro de src/core/', () => {
  const files = listCoreFiles();
  for (const file of files) {
    const source = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
    for (const specifier of extractSpecifiers(source)) {
      const isNodeBuiltin = specifier.startsWith('node:');
      if (isNodeBuiltin) {
        assert.ok(specifier.length > 'node:'.length);
        continue;
      }
      assert.ok(
        isRelativeCoreSpecifier(specifier),
        `${file}: specifier não relativo e não node:*: '${specifier}'`,
      );
      assert.ok(!specifier.includes('..'), `${file}: path traversal em '${specifier}'`);
      assert.ok(!path.isAbsolute(specifier), `${file}: caminho absoluto em '${specifier}'`);
      assert.ok(
        /^\.[\\/][A-Za-z0-9._-]+\.ts$/.test(specifier),
        `${file}: specifier fora do padrão ./x.ts: '${specifier}'`,
      );
      const resolved = path.resolve(CORE_DIR, specifier);
      assert.ok(
        resolved.startsWith(CORE_DIR + path.sep),
        `${file}: specifier fora de src/core/: '${specifier}'`,
      );
      assert.ok(fs.existsSync(resolved), `${file}: alvo inexistente '${specifier}'`);
    }
  }
});

test('CORE-10: extração de specifiers encontra os imports reais dos módulos', () => {
  const files = listCoreFiles();
  const allSpecifiers = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
    for (const specifier of extractSpecifiers(source)) {
      allSpecifiers.add(specifier);
    }
  }
  assert.ok(allSpecifiers.size > 0);
  for (const specifier of allSpecifiers) {
    assert.ok(specifier.startsWith('node:') || /^\.\//.test(specifier));
  }
});

test('CORE-11: package.json não possui campo dependencies', () => {
  assert.ok(fs.existsSync(PACKAGE_JSON));
  const raw = fs.readFileSync(PACKAGE_JSON, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  assert.equal('dependencies' in pkg, false);
  assert.equal(pkg['dependencies'], undefined);
});

test('CORE-11: devDependencies não contém SDK de vendor', () => {
  const raw = fs.readFileSync(PACKAGE_JSON, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const devDependencies = pkg['devDependencies'];
  if (devDependencies === undefined) {
    assert.equal(devDependencies, undefined);
    return;
  }
  assert.equal(typeof devDependencies, 'object');
  const names = Object.keys(devDependencies as Record<string, unknown>);
  for (const name of names) {
    const lower = name.toLowerCase();
    for (const vendor of VENDOR_SDK_NAMES) {
      assert.ok(!lower.includes(vendor), `devDependency de vendor detectada: '${name}'`);
    }
    assert.ok(!name.startsWith('@opencode'));
    assert.ok(!name.startsWith('@codex'));
    assert.ok(!name.startsWith('@openai'));
    assert.ok(!name.startsWith('@anthropic'));
  }
  for (const vendor of VENDOR_SDK_NAMES) {
    assert.ok(!names.includes(vendor));
    assert.ok(!names.includes(`@${vendor}/sdk`));
    assert.ok(!names.includes(`${vendor}-sdk`));
  }
});
