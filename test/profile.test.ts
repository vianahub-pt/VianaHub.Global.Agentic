import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GATE_CATALOG, getGate, resolveGate } from '../src/core/gates.ts';
import type { NonEmptyString, StackProfile } from '../src/core/ports.ts';
import type { GateId } from '../src/core/types.ts';
import { nodeTypescriptProfile } from '../src/profile/node-typescript.profile.ts';

function nes(s: string): NonEmptyString {
  return s as NonEmptyString;
}

describe('PROF-01: perfil cobre todos os gates do catálogo (sem lacunas)', () => {
  it('validGateIds tem exatamente os 8 ids do catálogo', () => {
    assert.equal(nodeTypescriptProfile.validGateIds.length, 8);
    assert.deepEqual(
      [...nodeTypescriptProfile.validGateIds],
      GATE_CATALOG.map((g) => g.id),
    );
  });

  it('todo gate do catálogo tem comando mapeado (sem lacunas)', () => {
    for (const gate of GATE_CATALOG) {
      const command = nodeTypescriptProfile.commands[gate.id];
      assert.ok(command, `Gate '${String(gate.id)}' must have a mapped command`);
      assert.ok(command.length > 0, `Gate '${String(gate.id)}' command must be non-empty`);
    }
  });

  it('não há gates fora do catálogo', () => {
    const catalogIds = new Set(GATE_CATALOG.map((g) => g.id));
    for (const id of nodeTypescriptProfile.validGateIds) {
      assert.ok(catalogIds.has(id), `Gate '${String(id)}' is not in the catalog`);
    }
  });
});

describe('PROF-02: comandos reais declarados no AGENTS.md', () => {
  it('mapeia cada gate para o comando oficial', () => {
    const expected: Readonly<Record<GateId, string>> = {
      whitespace: 'git diff --check',
      format: 'npm run format:check',
      lint: 'npm run lint',
      typecheck: 'npm run typecheck',
      test: 'npm test',
      coverage: 'npm run test:coverage',
      build: 'npm run build',
      audit: 'npm run audit',
    };
    for (const gate of GATE_CATALOG) {
      assert.equal(nodeTypescriptProfile.commands[gate.id], expected[gate.id]);
    }
  });

  it('resolveGate devolve exatamente o comando oficial', () => {
    const resolution = resolveGate(getGate('audit'), nodeTypescriptProfile);
    if (resolution.status !== 'RESOLVED') {
      assert.fail('expected RESOLVED for audit gate');
    }
    assert.equal(resolution.command, 'npm run audit');
  });
});

describe('PROF-03: perfil é dado declarativo', () => {
  it('é serializável sem perda (JSON round-trip)', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(nodeTypescriptProfile));
    assert.deepEqual(roundTripped, {
      validGateIds: [
        'whitespace',
        'format',
        'lint',
        'typecheck',
        'test',
        'coverage',
        'build',
        'audit',
      ],
      commands: {
        whitespace: 'git diff --check',
        format: 'npm run format:check',
        lint: 'npm run lint',
        typecheck: 'npm run typecheck',
        test: 'npm test',
        coverage: 'npm run test:coverage',
        build: 'npm run build',
        audit: 'npm run audit',
      },
    });
  });

  it('é imutável (Object.freeze em perfil, validGateIds e commands)', () => {
    assert.ok(Object.isFrozen(nodeTypescriptProfile));
    assert.ok(Object.isFrozen(nodeTypescriptProfile.validGateIds));
    assert.ok(Object.isFrozen(nodeTypescriptProfile.commands));
  });

  it('contém apenas dados, sem lógica imperativa (sem funções)', () => {
    assert.deepEqual(Object.keys(nodeTypescriptProfile).sort(), ['commands', 'validGateIds']);
    for (const value of Object.values(nodeTypescriptProfile)) {
      assert.notEqual(typeof value, 'function');
    }
    for (const value of Object.values(nodeTypescriptProfile.commands)) {
      assert.notEqual(typeof value, 'function');
      assert.equal(typeof value, 'string');
    }
  });
});

describe('PROF-04: gate sem mapeamento resolve UNAVAILABLE (fail-closed)', () => {
  it('perfil parcial sem o gate devolve UNAVAILABLE com motivo', () => {
    const partial: StackProfile = Object.freeze({
      validGateIds: Object.freeze(['whitespace'] as readonly GateId[]),
      commands: Object.freeze({ whitespace: nes('git diff --check') }),
    });
    const resolution = resolveGate(getGate('audit'), partial);
    if (resolution.status !== 'UNAVAILABLE') {
      assert.fail('expected UNAVAILABLE for unmapped gate');
    }
    assert.equal(resolution.gate.id, 'audit');
    assert.ok(resolution.reason.length > 0);
  });

  it('gate mapeado no perfil parcial continua RESOLVED', () => {
    const partial: StackProfile = Object.freeze({
      validGateIds: Object.freeze(['whitespace'] as readonly GateId[]),
      commands: Object.freeze({ whitespace: nes('git diff --check') }),
    });
    const resolution = resolveGate(getGate('whitespace'), partial);
    if (resolution.status !== 'RESOLVED') {
      assert.fail('expected RESOLVED for mapped gate');
    }
    assert.equal(resolution.command, 'git diff --check');
  });
});

describe('PROF-05: perfil alternativo injetado substitui sem alterar o Core', () => {
  it('resolveGate usa o perfil injetado (comandos diferentes)', () => {
    const fakeProfile: StackProfile = Object.freeze({
      validGateIds: Object.freeze(['test'] as readonly GateId[]),
      commands: Object.freeze({ test: nes('pytest') }),
    });
    const resolution = resolveGate(getGate('test'), fakeProfile);
    if (resolution.status !== 'RESOLVED') {
      assert.fail('expected RESOLVED with fake profile');
    }
    assert.equal(resolution.command, 'pytest');
  });

  it('a injeção não altera o Core nem o perfil oficial', () => {
    const fakeProfile: StackProfile = Object.freeze({
      validGateIds: Object.freeze(['test'] as readonly GateId[]),
      commands: Object.freeze({ test: nes('pytest') }),
    });
    resolveGate(getGate('test'), fakeProfile);
    assert.equal(GATE_CATALOG.length, 8);
    assert.equal(nodeTypescriptProfile.commands.test, 'npm test');
  });
});

describe('PROF-06: documentação de perfis', () => {
  it('docs/architecture/perfis.md existe e cobre extensões futuras', () => {
    const docUrl = new URL('../docs/architecture/perfis.md', import.meta.url);
    assert.ok(existsSync(docUrl), 'docs/architecture/perfis.md must exist');
    const content = readFileSync(docUrl, 'utf-8');
    assert.ok(content.includes('Python'), 'perfis.md must mention Python as future extension');
    assert.ok(content.includes('Go'), 'perfis.md must mention Go as future extension');
  });
});
