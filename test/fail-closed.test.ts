// GUARD-08 — Fail-closed: nenhuma falha de gate, roteamento ou validação é convertida em
// sucesso silencioso. Cada classe de falha vira erro tipado (DomainError + code estável) ou
// veredito/estado de parada explícito — nunca PASS, nunca avanço. Espelha as regras fail-closed
// de AGENTS.md e o princípio 7 da spec ("erro/estado de parada, nunca avanço silencioso").
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GateRunSession,
  NoTestRunnerDeclaredError,
  UnknownGateError,
  evaluateGateRun,
  evaluateTestRunnerDeclaration,
  getGate,
  resolveGate,
  runGate,
} from '../src/core/gates.ts';
import { DomainError } from '../src/core/errors.ts';
import { InvalidRoutingError, assertRoutingPass } from '../src/core/routing.ts';
import {
  OPENCODE_ROUTING_PROBES,
  OpenCodeAdapter,
  validateRoutingProbes,
} from '../src/adapters/opencode/opencode-adapter.ts';
import { FakeAdapter } from '../src/adapters/fake/fake-adapter.ts';
import {
  LoopEngine,
  SuccessConditionsUnmetError,
  assertReadyForHumanReview,
  assertTerminalEvidence,
  evaluateSuccess,
  type SprintEvidence,
} from '../src/core/loop.ts';
import {
  LOOP_STATE_SCHEMA_VERSION,
  assertLoopStateDocument,
  deserializeLoopState,
} from '../src/core/loop-state.ts';
import {
  InvalidJournalEntryError,
  MemoryJournalSink,
  assertValidJournalEntry,
} from '../src/core/journal.ts';
import { GuardViolationError, assertCanEdit, assertNoNetworkImports } from '../src/core/guards.ts';
import { transition } from '../src/core/state-machine.ts';
import {
  toNonEmptyString,
  type GateId,
  type GateResult,
  type LoopState,
  type Role,
} from '../src/core/types.ts';
import type { StackProfile } from '../src/core/ports.ts';

const BRANCH = 'feature/sprint-0-bootstrap-agentic-framework';
const SHA_BASE = '10f90995c9052786e1c63ae5fb44e7c347c3eb01';
const FIXED_TS = '2026-10-02T12:00:00.000Z';

const TEST_PROFILE: StackProfile = {
  validGateIds: ['test', 'lint'],
  commands: {
    test: toNonEmptyString('npm run test'),
    lint: toNonEmptyString('npm run lint'),
  },
};

const PROFILE_WITHOUT_MAPPING: StackProfile = {
  validGateIds: ['audit'],
  commands: {},
};

/**
 * Garante que `fn` lança erro tipado com o code esperado. Se `fn` concluir em silêncio, o teste
 * reprova: nenhuma fronteira pode transformar falha em sucesso sem sinalização.
 */
function expectDomainError(fn: () => unknown, expectedCode: string): DomainError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DomainError, `esperava DomainError, veio: ${String(error)}`);
    assert.equal(error.code, expectedCode, `código de erro inesperado: ${error.code}`);
    return error;
  }
  assert.fail('esperava erro tipado; a operação concluiu em silêncio (fail-closed violado)');
}

function buildGate(overrides: Partial<GateResult> = {}): GateResult {
  return {
    gateId: 'test',
    command: 'npm run test',
    exitCode: 0,
    durationMs: 100,
    verdict: 'PASS',
    stdout: '',
    stderr: '',
    reason: '',
    ...overrides,
  };
}

function buildEvidence(overrides: Partial<SprintEvidence> = {}): SprintEvidence {
  return {
    criteria: [{ criterionId: 'GUARD-08', completed: true, evidence: 'test/fail-closed.test.ts' }],
    gates: [buildGate()],
    tests: { executed: true, passed: 4, failed: 0 },
    findings: [],
    documentationComplete: true,
    loopStateComplete: true,
    ...overrides,
  };
}

test('GUARD-08: gate FAIL vira veredito FAIL explícito — nunca PASS', () => {
  const failing = runGate(getGate('test'), TEST_PROFILE, {
    execute: () => ({ exitCode: 1, stdout: '', stderr: 'reprovado' }),
  });
  assert.equal(failing.verdict, 'FAIL');
  assert.equal(failing.exitCode, 1);
  assert.equal(failing.gateId, 'test');

  const run = evaluateGateRun([buildGate(), failing]);
  assert.equal(run.allPassed, false);
  assert.equal(run.failures.length, 1);
  assert.equal(run.failures[0]?.verdict, 'FAIL');
});

test('GUARD-08: gate indisponível, fora do catálogo ou sem runner viram falha tipada', () => {
  // Gate sem mapeamento no perfil: UNAVAILABLE explícito, nunca execução improvisada.
  const unavailable = runGate(getGate('audit'), PROFILE_WITHOUT_MAPPING, {
    execute: () => ({ exitCode: 0, stdout: '', stderr: '' }),
  });
  assert.equal(unavailable.verdict, 'UNAVAILABLE');
  assert.equal(unavailable.exitCode, -1);
  assert.equal(resolveGate(getGate('audit'), PROFILE_WITHOUT_MAPPING).status, 'UNAVAILABLE');

  // Gate fora do catálogo não executa: erro tipado.
  const unknown = expectDomainError(
    () => getGate('inexistente' as unknown as GateId),
    'UNKNOWN_GATE',
  );
  assert.ok(unknown instanceof UnknownGateError);

  // Ausência de runner declarado: NO_TEST_RUNNER_DECLARED nunca equivale a PASS.
  const noRunner = expectDomainError(
    () => evaluateTestRunnerDeclaration(false),
    'NO_TEST_RUNNER_DECLARED',
  );
  assert.ok(noRunner instanceof NoTestRunnerDeclaredError);
  evaluateTestRunnerDeclaration(true);
});

test('GUARD-08: exceção do executor propaga e gate executado duas vezes é erro tipado', () => {
  assert.throws(
    () =>
      runGate(getGate('test'), TEST_PROFILE, {
        execute: () => {
          throw new Error('executor estourou');
        },
      }),
    /executor estourou/,
  );

  const session = new GateRunSession();
  session.record('npm run test');
  session.assertOneCallPerGate();
  session.record('npm run test');
  expectDomainError(() => session.assertOneCallPerGate(), 'GATE_MULTIPLE_CALLS');
});

test('GUARD-08: gate FAIL nunca alcança READY_FOR_HUMAN_REVIEW (erro tipado na fronteira)', () => {
  const evidence = buildEvidence({ gates: [buildGate({ verdict: 'FAIL', exitCode: 1 })] });

  const unmet = expectDomainError(
    () => assertReadyForHumanReview(evidence),
    'SUCCESS_CONDITIONS_UNMET',
  );
  assert.ok(unmet instanceof SuccessConditionsUnmetError);
  assert.ok(unmet.unmet.includes('gatesAndTestsPass'));

  const engine = new LoopEngine({
    sprint: 'sprint-0',
    branch: BRANCH,
    shaBase: SHA_BASE,
    journal: new MemoryJournalSink(),
    now: () => FIXED_TS,
  });
  expectDomainError(
    () => engine.finish('READY_FOR_HUMAN_REVIEW', evidence),
    'SUCCESS_CONDITIONS_UNMET',
  );
  assert.equal(engine.current.state, 'NOT_STARTED');
});

test('GUARD-08: roteamento inválido vira erro tipado — nunca AGENT_ROUTING_PASS', () => {
  assert.equal(assertRoutingPass('AGENT_ROUTING_PASS'), 'AGENT_ROUTING_PASS');

  const invalid = expectDomainError(
    () => assertRoutingPass('INVALID_AGENT_ROUTING'),
    'INVALID_AGENT_ROUTING',
  );
  assert.ok(invalid instanceof InvalidRoutingError);
  assert.equal(invalid.status, 'INVALID_AGENT_ROUTING');

  const required = expectDomainError(
    () => assertRoutingPass('AGENT_ROUTING_REQUIRED'),
    'AGENT_ROUTING_REQUIRED',
  );
  assert.ok(required instanceof InvalidRoutingError);
  assert.equal(required.status, 'AGENT_ROUTING_REQUIRED');

  expectDomainError(() => assertRoutingPass(undefined), 'INVALID_AGENT_ROUTING');
  expectDomainError(() => assertRoutingPass('AGENT_OK:general'), 'INVALID_AGENT_ROUTING');
});

test('GUARD-08: sondagens e adapters reportam parada de roteamento — nunca sucesso', () => {
  const exact = OPENCODE_ROUTING_PROBES.map((probe) => probe.expected);

  const wrong = [...exact];
  wrong[2] = 'AGENT_OK:general';
  assert.equal(validateRoutingProbes(wrong), 'INVALID_AGENT_ROUTING');
  expectDomainError(() => assertRoutingPass(validateRoutingProbes(wrong)), 'INVALID_AGENT_ROUTING');

  assert.equal(validateRoutingProbes([]), 'AGENT_ROUTING_REQUIRED');
  expectDomainError(() => assertRoutingPass(validateRoutingProbes([])), 'AGENT_ROUTING_REQUIRED');

  const fake = new FakeAdapter();
  fake.applyRouting(['general' as unknown as Role]);
  assert.equal(fake.reportRoutingStatus(), 'INVALID_AGENT_ROUTING');
  assert.deepEqual([...fake.routedRoles], []);
  expectDomainError(() => assertRoutingPass(fake.reportRoutingStatus()), 'INVALID_AGENT_ROUTING');

  const opencode = new OpenCodeAdapter({ emit: () => {} });
  opencode.applyRouting(['build' as unknown as Role]);
  assert.equal(opencode.reportRoutingStatus(), 'INVALID_AGENT_ROUTING');
  expectDomainError(
    () => assertRoutingPass(opencode.reportRoutingStatus()),
    'INVALID_AGENT_ROUTING',
  );
});

test('GUARD-08: entrada não validada vira erro tipado — nunca sucesso silencioso', () => {
  // loop-state: formato e schemaVersion.
  expectDomainError(() => assertLoopStateDocument({}), 'LOOP_STATE_INVALID');
  expectDomainError(() => deserializeLoopState('{'), 'LOOP_STATE_INVALID');
  expectDomainError(
    () =>
      assertLoopStateDocument({
        schemaVersion: '9',
        sprintId: 'sprint-0',
        branch: BRANCH,
        shaBase: SHA_BASE,
        status: 'IMPLEMENTING',
        cycle: 1,
        iteration: 1,
        finalRemediationRound: 0,
      }),
    'UNSUPPORTED_SCHEMA_VERSION',
  );
  expectDomainError(
    () =>
      assertLoopStateDocument({
        schemaVersion: LOOP_STATE_SCHEMA_VERSION,
        sprintId: 'sprint-0',
        branch: BRANCH,
        shaBase: SHA_BASE,
        status: 'ESTADO_FANTASMA',
        cycle: 1,
        iteration: 1,
        finalRemediationRound: 0,
      }),
    'UNKNOWN_STATE',
  );

  // journal: entrada fora do formato nunca é gravada como válida.
  expectDomainError(() => assertValidJournalEntry({}), 'INVALID_JOURNAL_ENTRY');

  // Evidência de estado terminal: pilar ausente ou critério sem evidência nunca vira sucesso.
  expectDomainError(
    () => assertTerminalEvidence('BLOCKED_NEEDS_HUMAN', buildEvidence({ gates: [] })),
    'TERMINAL_EVIDENCE_MISSING',
  );
  expectDomainError(
    () =>
      assertTerminalEvidence(
        'READY_FOR_HUMAN_REVIEW',
        buildEvidence({ criteria: [{ criterionId: 'MIG-01', completed: false, evidence: '' }] }),
      ),
    'CRITERION_EVIDENCE_MISSING',
  );

  // Guardrails e rede: negação vira erro tipado.
  expectDomainError(() => assertCanEdit('sprint-reviewer', 'src/core/loop.ts'), 'GUARD_VIOLATION');
  expectDomainError(() => assertCanEdit('sprint-implementer', 'AGENTS.md'), 'GUARD_VIOLATION');
  expectDomainError(() => assertNoNetworkImports(['node:https']), 'GUARD_VIOLATION');

  // Máquina de estados e comandos: transição inválida e comando vazio nunca avançam.
  expectDomainError(() => transition('PREFLIGHT', 'READY_FOR_HUMAN_REVIEW'), 'INVALID_TRANSITION');
  assert.throws(() => toNonEmptyString('   '), /Comando vazio/);
});

test('GUARD-08: nenhuma fronteira converte falha em sucesso (avaliação e serialização)', () => {
  const partial = buildEvidence({ documentationComplete: false });
  const verdict = evaluateSuccess(partial);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.ok(verdict.unmet.includes('documentationComplete'));
  }
  expectDomainError(() => assertReadyForHumanReview(partial), 'SUCCESS_CONDITIONS_UNMET');

  const fake = new FakeAdapter();
  expectDomainError(() => fake.deserializeLoopState('não é JSON'), 'LOOP_STATE_INVALID');
  expectDomainError(() => fake.deserializeLoopState('"ESTADO_FANTASMA"'), 'UNKNOWN_STATE');
  expectDomainError(() => fake.serializeLoopState('X' as unknown as LoopState), 'UNKNOWN_STATE');
});

test('GUARD-08: erros tipados herdam DomainError e preservam code estável', () => {
  const typed: ReadonlyArray<readonly [DomainError, string]> = [
    [new UnknownGateError('test'), 'UNKNOWN_GATE'],
    [new NoTestRunnerDeclaredError(), 'NO_TEST_RUNNER_DECLARED'],
    [new InvalidRoutingError('INVALID_AGENT_ROUTING'), 'INVALID_AGENT_ROUTING'],
    [new SuccessConditionsUnmetError(['criteriaComplete']), 'SUCCESS_CONDITIONS_UNMET'],
    [new InvalidJournalEntryError('phase'), 'INVALID_JOURNAL_ENTRY'],
  ];
  for (const [error, code] of typed) {
    assert.ok(error instanceof DomainError);
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.ok(error.name.length > 0);
  }
  assert.ok(new GuardViolationError('PATH_DENIED', 'src/x.ts', 'negado') instanceof DomainError);
});
