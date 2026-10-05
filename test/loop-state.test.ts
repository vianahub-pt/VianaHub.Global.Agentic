// LOOP-05, LOOP-06 — Testes da persistência de loop-state e do checkpoint branch + SHA-base.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOP_STATE_SCHEMA_VERSION,
  LoopStateFormatError,
  UnsupportedSchemaVersionError,
  assertKnownState,
  assertLoopStateDocument,
  deserializeLoopState,
  evaluateCheckpoint,
  isLoopState,
  isLoopStateDocument,
  serializeLoopState,
  type LoopStateDocument,
} from '../src/core/loop-state.ts';
import { UnknownStateError } from '../src/core/errors.ts';

function buildDocument(overrides: Partial<LoopStateDocument> = {}): LoopStateDocument {
  return {
    schemaVersion: LOOP_STATE_SCHEMA_VERSION,
    sprintId: 'sprint-0',
    branch: 'feature/sprint-0-bootstrap-agentic-framework',
    shaBase: '10f90995c9052786e1c63ae5fb44e7c347c3eb01',
    status: 'IMPLEMENTING',
    cycle: 2,
    iteration: 1,
    finalRemediationRound: 0,
    ...overrides,
  };
}

function rawDocument(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: LOOP_STATE_SCHEMA_VERSION,
    sprintId: 'sprint-0',
    branch: 'feature/sprint-0-bootstrap-agentic-framework',
    shaBase: '10f90995c9052786e1c63ae5fb44e7c347c3eb01',
    status: 'IMPLEMENTING',
    cycle: 2,
    iteration: 1,
    finalRemediationRound: 0,
    ...overrides,
  });
}

test('LOOP-05: serialização/deserialização preserva todos os campos (round-trip)', () => {
  const document = buildDocument();
  const raw = serializeLoopState(document);
  const parsed = deserializeLoopState(raw);
  assert.deepEqual(parsed, document);
  const payload = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(payload['schemaVersion'], LOOP_STATE_SCHEMA_VERSION);
  assert.equal(payload['branch'], document.branch);
  assert.equal(payload['shaBase'], document.shaBase);
  assert.equal(payload['status'], document.status);
  assert.equal(payload['cycle'], document.cycle);
  assert.equal(payload['iteration'], document.iteration);
  assert.equal(payload['finalRemediationRound'], document.finalRemediationRound);
});

test('LOOP-05: schemaVersion é declarada, presente e obrigatório', () => {
  assert.equal(LOOP_STATE_SCHEMA_VERSION, '1');
  assert.throws(
    () => deserializeLoopState(rawDocument({ schemaVersion: '2' })),
    (error: unknown) => {
      assert.ok(error instanceof UnsupportedSchemaVersionError);
      assert.equal(error.schemaVersion, '2');
      assert.equal(error.code, 'UNSUPPORTED_SCHEMA_VERSION');
      return true;
    },
  );
  assert.throws(
    () => deserializeLoopState(rawDocument({ schemaVersion: '' })),
    (error: unknown) => {
      assert.ok(error instanceof LoopStateFormatError);
      assert.equal(error.field, 'schemaVersion');
      return true;
    },
  );
});

test('LOOP-05: payload não-JSON ou vazio falha fechado', () => {
  assert.throws(
    () => deserializeLoopState('não é json'),
    (error: unknown) => {
      assert.ok(error instanceof LoopStateFormatError);
      assert.equal(error.field, 'json');
      return true;
    },
  );
  assert.throws(
    () => deserializeLoopState('   '),
    (error: unknown) => {
      assert.ok(error instanceof LoopStateFormatError);
      assert.equal(error.field, 'payload');
      return true;
    },
  );
});

test('LOOP-05: campo ausente ou fora do formato falha com campo preciso', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['branch', { branch: '' }],
    ['shaBase', { shaBase: ' ' }],
    ['sprintId', { sprintId: '' }],
    ['cycle', { cycle: 0 }],
    ['cycle', { cycle: 1.5 }],
    ['iteration', { iteration: -1 }],
    ['status', { status: 42 }],
    ['finalRemediationRound', { finalRemediationRound: -1 }],
    ['finalRemediationRound', { finalRemediationRound: 1.5 }],
    ['finalRemediationRound', { finalRemediationRound: '2' }],
    ['finalRemediationRound', { finalRemediationRound: undefined }],
  ];
  for (const [field, overrides] of cases) {
    assert.throws(
      () => deserializeLoopState(rawDocument(overrides)),
      (error: unknown) => {
        assert.ok(error instanceof LoopStateFormatError);
        assert.equal(error.field, field);
        return true;
      },
    );
  }
});

test('LOOP-05: estado desconhecido no loop-state lança UnknownStateError', () => {
  assert.throws(
    () => deserializeLoopState(rawDocument({ status: 'RUNNING' })),
    (error: unknown) => {
      assert.ok(error instanceof UnknownStateError);
      assert.equal(error.state, 'RUNNING');
      return true;
    },
  );
});

test('LOOP-05: isLoopStateDocument valida estrutura fail-closed', () => {
  assert.equal(isLoopStateDocument(buildDocument()), true);
  assert.equal(
    isLoopStateDocument(deserializeLoopState(serializeLoopState(buildDocument()))),
    true,
  );
  assert.equal(isLoopStateDocument({}), false);
  assert.equal(isLoopStateDocument(null), false);
  assert.equal(isLoopStateDocument('doc'), false);
  assert.equal(isLoopStateDocument(buildDocument({ status: 'RUNNING' as never })), false);
  assert.equal(isLoopStateDocument(buildDocument({ schemaVersion: '2' })), false);
  assert.equal(isLoopStateDocument(buildDocument({ cycle: 0 })), false);
  assert.equal(isLoopStateDocument(buildDocument({ finalRemediationRound: -1 })), false);
  assert.equal(isLoopStateDocument(buildDocument({ finalRemediationRound: 2 })), true);
  assert.equal(isLoopStateDocument([buildDocument()]), false);
});

test('LOOP-05: isLoopState e assertKnownState re-exportados funcionam fail-closed', () => {
  assert.equal(isLoopState('GATE_RUN'), true);
  assert.equal(isLoopState('READY_FOR_HUMAN_REVIEW'), true);
  assert.equal(isLoopState('RUNNING'), false);
  assert.doesNotThrow(() => assertKnownState('PREFLIGHT'));
  assert.doesNotThrow(() => assertKnownState('BLOCKED_NEEDS_HUMAN'));
  assert.throws(() => assertKnownState('DONE'), UnknownStateError);
});

test('LOOP-05: serialização rejeita documento inválido e deserialização congela o resultado', () => {
  assert.throws(
    () => serializeLoopState(buildDocument({ schemaVersion: '9' })),
    UnsupportedSchemaVersionError,
  );
  assert.throws(
    () => assertLoopStateDocument(buildDocument({ branch: '' })),
    (error: unknown) => {
      assert.ok(error instanceof LoopStateFormatError);
      assert.equal(error.field, 'branch');
      return true;
    },
  );
  const parsed = deserializeLoopState(serializeLoopState(buildDocument()));
  assert.ok(Object.isFrozen(parsed));
});

test('LOOP-06: checkpoint compatível (branch + SHA-base) retoma no passo registrado', () => {
  const document = buildDocument({
    status: 'TESTING',
    cycle: 3,
    iteration: 4,
    finalRemediationRound: 2,
  });
  const verdict = evaluateCheckpoint(document, {
    branch: document.branch,
    shaBase: document.shaBase,
  });
  assert.equal(verdict.compatible, true);
  if (!verdict.compatible) {
    assert.fail('checkpoint deveria ser compatível');
  }
  assert.equal(verdict.resumeFrom, 'TESTING');
  assert.equal(verdict.cycle, 3);
  assert.equal(verdict.iteration, 4);
  assert.equal(verdict.finalRemediationRound, 2);
});

test('LOOP-06: checkpoint com branch divergente sinaliza BLOCKED_NEEDS_HUMAN', () => {
  const document = buildDocument();
  const verdict = evaluateCheckpoint(document, {
    branch: 'outra-branch',
    shaBase: document.shaBase,
  });
  assert.equal(verdict.compatible, false);
  if (verdict.compatible) {
    assert.fail('checkpoint deveria ser incompatível');
  }
  assert.equal(verdict.stop, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(verdict.reason.includes('branch'));
  assert.ok(verdict.reason.includes('outra-branch'));
});

test('LOOP-06: checkpoint com SHA-base divergente sinaliza BLOCKED_NEEDS_HUMAN', () => {
  const document = buildDocument();
  const verdict = evaluateCheckpoint(document, {
    branch: document.branch,
    shaBase: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  });
  assert.equal(verdict.compatible, false);
  if (verdict.compatible) {
    assert.fail('checkpoint deveria ser incompatível');
  }
  assert.equal(verdict.stop, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(verdict.reason.includes('SHA-base'));
});

test('LOOP-06: evaluateCheckpoint valida o documento antes de comparar (fail-closed)', () => {
  assert.throws(
    () => evaluateCheckpoint(buildDocument({ cycle: 0 }), { branch: 'x', shaBase: 'y' }),
    LoopStateFormatError,
  );
});
