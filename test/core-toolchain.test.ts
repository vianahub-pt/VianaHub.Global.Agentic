// CORE-01, CORE-02 — Testes da toolchain declarada (tsconfig.json e engines).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TSCONFIG_PATH = path.join(process.cwd(), 'tsconfig.json');
const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');

function readJson(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function readCompilerOptions(): Record<string, unknown> {
  const tsconfig = readJson(TSCONFIG_PATH);
  const compilerOptions = tsconfig['compilerOptions'];
  assert.equal(typeof compilerOptions, 'object');
  assert.notEqual(compilerOptions, null);
  return compilerOptions as Record<string, unknown>;
}

test('CORE-01: tsconfig.json existe na raiz com compilerOptions', () => {
  assert.ok(fs.existsSync(TSCONFIG_PATH));
  const compilerOptions = readCompilerOptions();
  assert.ok(Object.keys(compilerOptions).length > 0);
});

test('CORE-01: compilerOptions ativa strict e noImplicitAny', () => {
  const compilerOptions = readCompilerOptions();
  assert.equal(compilerOptions['strict'], true);
  assert.equal(compilerOptions['noImplicitAny'], true);
});

test('CORE-01: compilerOptions ativa erasableSyntaxOnly', () => {
  const compilerOptions = readCompilerOptions();
  assert.equal(compilerOptions['erasableSyntaxOnly'], true);
});

test('CORE-02: compilerOptions usa module e moduleResolution nodenext', () => {
  const compilerOptions = readCompilerOptions();
  assert.equal(compilerOptions['module'], 'nodenext');
  assert.equal(compilerOptions['moduleResolution'], 'nodenext');
});

test('CORE-02: compilerOptions ativa verbatimModuleSyntax', () => {
  const compilerOptions = readCompilerOptions();
  assert.equal(compilerOptions['verbatimModuleSyntax'], true);
});

test('CORE-02: compilerOptions permite e reescreve extensões .ts relativas', () => {
  const compilerOptions = readCompilerOptions();
  assert.equal(compilerOptions['allowImportingTsExtensions'], true);
  assert.equal(compilerOptions['rewriteRelativeImportExtensions'], true);
});

test('CORE-02: todas as opções exigidas estão presentes e verdadeiras', () => {
  const compilerOptions = readCompilerOptions();
  const requiredTrue = [
    'strict',
    'noImplicitAny',
    'erasableSyntaxOnly',
    'verbatimModuleSyntax',
    'allowImportingTsExtensions',
    'rewriteRelativeImportExtensions',
  ];
  for (const option of requiredTrue) {
    assert.equal(compilerOptions[option], true, `compilerOptions.${option} deve ser true`);
  }
  assert.equal(compilerOptions['module'], 'nodenext');
  assert.equal(compilerOptions['moduleResolution'], 'nodenext');
});

test('CORE-02: package.json declara engines.node compatível com >=24', () => {
  assert.ok(fs.existsSync(PACKAGE_JSON_PATH));
  const pkg = readJson(PACKAGE_JSON_PATH);
  const engines = pkg['engines'];
  assert.equal(typeof engines, 'object');
  assert.notEqual(engines, null);
  const nodeEngine = (engines as Record<string, unknown>)['node'];
  assert.equal(typeof nodeEngine, 'string');
  const range = nodeEngine as string;
  assert.ok(range.length > 0);
  assert.ok(!range.trimStart().startsWith('<'), `engines.node restritivo: '${range}'`);
  const major = Number.parseInt(range.replace(/^\D+/, ''), 10);
  assert.equal(Number.isNaN(major), false);
  assert.ok(major >= 24, `engines.node '${range}' não é compatível com >=24`);
  assert.ok(/\b24\b|\b(2[4-9]|[3-9]\d)\b/.test(range), `engines.node '${range}' fora de >=24`);
});
