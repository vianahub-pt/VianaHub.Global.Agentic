// LOOP-03, LOOP-04, LOOP-05, LOOP-06, LOOP-07, LOOP-09, LOOP-10 — Motor do loop de Sprint:
// limite de ciclos, FINAL_REMEDIATION, loop-state versionado, retomada por checkpoint,
// contradições loop-state × working tree, condições exclusivas de sucesso e evidência
// obrigatória por estado terminal. LOOP-08 (journal) é coberto em journal.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LoopEngine,
  MAX_CYCLES,
  MAX_FINAL_REMEDIATION_ROUNDS,
  SUCCESS_CONDITION_IDS,
  SuccessConditionsUnmetError,
  TerminalEvidenceError,
  assertReadyForHumanReview,
  assertTerminalEvidence,
  detectContradictions,
  enterCycle,
  evaluateSuccess,
  initialPosition,
  requestFinalRemediationRound,
  requestNextCycle,
  resumeLoop,
  type LoopDecision,
  type LoopPosition,
  type LoopReality,
  type SprintEvidence,
  type TestEvidence,
} from '../src/core/loop.ts';
import {
  LOOP_STATE_SCHEMA_VERSION,
  deserializeLoopState,
  serializeLoopState,
  type LoopStateDocument,
  type WorkingTreeSnapshot,
} from '../src/core/loop-state.ts';
import { CriterionEvidenceError, DomainError } from '../src/core/errors.ts';
import {
  GATE_IDS,
  TERMINAL_STATES,
  type Finding,
  type GateResult,
  type GateId,
  type JournalEntry,
  type TerminalState,
} from '../src/core/types.ts';
import { SUCCESS_TERMINAL } from '../src/core/state-machine.ts';
import { JOURNAL_SCHEMA_VERSION } from '../src/core/journal.ts';
import type { JournalSink } from '../src/core/ports.ts';

const BRANCH = 'feature/sprint-0-bootstrap-agentic-framework';
const SHA_BASE = '10f90995c9052786e1c63ae5fb44e7c347c3eb01';
const FIXED_TS = '2026-10-01T12:00:00.000Z';

function buildDocument(overrides: Partial<LoopStateDocument> = {}): LoopStateDocument {
  return {
    schemaVersion: LOOP_STATE_SCHEMA_VERSION,
    sprintId: 'sprint-0',
    branch: BRANCH,
    shaBase: SHA_BASE,
    status: 'IMPLEMENTING',
    cycle: 2,
    iteration: 1,
    finalRemediationRound: 0,
    ...overrides,
  };
}

function matchingTree(overrides: Partial<WorkingTreeSnapshot> = {}): WorkingTreeSnapshot {
  return { branch: BRANCH, shaBase: SHA_BASE, ...overrides };
}

function buildReality(overrides: Partial<LoopReality> = {}): LoopReality {
  return {
    workingTree: matchingTree(),
    pendingCriteria: [],
    externalChanges: [],
    ...overrides,
  };
}

function expectTerminal(decision: LoopDecision): { state: TerminalState; reason: string } {
  if (decision.kind !== 'TERMINAL') {
    assert.fail(`esperava decisão TERMINAL, veio CONTINUE (${decision.position.state})`);
  }
  return { state: decision.state, reason: decision.reason };
}

function expectContinue(decision: LoopDecision): LoopPosition {
  if (decision.kind !== 'CONTINUE') {
    assert.fail(`esperava decisão CONTINUE, veio TERMINAL (${decision.state})`);
  }
  return decision.position;
}

function expectUnmet(evidence: SprintEvidence, expected: readonly string[]): void {
  const verdict = evaluateSuccess(evidence);
  if (verdict.ok) {
    assert.fail(`esperava reprovação em: ${expected.join(', ')}`);
  }
  assert.deepEqual([...verdict.unmet], [...expected]);
}

function buildGate(overrides: Partial<GateResult> = {}): GateResult {
  return {
    gateId: 'test',
    command: 'npm run test',
    exitCode: 0,
    durationMs: 250,
    verdict: 'PASS',
    stdout: 'todos os testes passaram',
    stderr: '',
    reason: '',
    ...overrides,
  };
}

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-001',
    severity: 'LOW',
    title: 'achado não bloqueante',
    detail: 'detalhe do achado',
    ...overrides,
  };
}

const ALL_GATES_PASSING = GATE_IDS.map((id, index) =>
  buildGate({
    gateId: id as GateId,
    command: `npm run ${id}`,
    durationMs: index * 10,
  }),
);

function buildEvidence(overrides: Partial<SprintEvidence> = {}): SprintEvidence {
  return {
    criteria: [{ criterionId: 'LOOP-03', completed: true, evidence: 'testes verdes' }],
    gates: ALL_GATES_PASSING,
    tests: { executed: true, passed: 60, failed: 0 },
    findings: [],
    documentationComplete: true,
    loopStateComplete: true,
    ...overrides,
  };
}

function createRecordingSink(): JournalSink {
  const entries: JournalEntry[] = [];
  return {
    append(entry: JournalEntry): void {
      entries.push(entry);
    },
    readAll(): readonly JournalEntry[] {
      return entries;
    },
  };
}

function createEngine(journal: JournalSink): LoopEngine {
  return new LoopEngine({
    sprint: 'sprint-0',
    branch: BRANCH,
    shaBase: SHA_BASE,
    journal,
    now: () => FIXED_TS,
  });
}

// ---------------------------------------------------------------------------
// LOOP-03 — limite de 5 ciclos; ciclo 6 (ou superior) → MAX_ITERATIONS_REACHED
// ---------------------------------------------------------------------------

test('LOOP-03: MAX_CYCLES é 5 e a posição inicial nasce em NOT_STARTED', () => {
  assert.equal(MAX_CYCLES, 5);
  const position = initialPosition();
  assert.deepEqual(position, {
    cycle: 1,
    iteration: 1,
    finalRemediationRound: 0,
    state: 'NOT_STARTED',
  });
  assert.ok(Object.isFrozen(position));
});

test('LOOP-03: enterCycle aceita os 5 ciclos com posição congelada em PREFLIGHT', () => {
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
    const position = expectContinue(enterCycle(cycle));
    assert.equal(position.cycle, cycle);
    assert.equal(position.iteration, 1);
    assert.equal(position.finalRemediationRound, 0);
    assert.equal(position.state, 'PREFLIGHT');
    assert.ok(Object.isFrozen(position));
  }
});

test('LOOP-03: enterCycle com iteração explícita preserva a iteração', () => {
  const position = expectContinue(enterCycle(3, 2));
  assert.equal(position.cycle, 3);
  assert.equal(position.iteration, 2);
});

test('LOOP-03: ciclo 6 ou superior nunca entra em execução (MAX_ITERATIONS_REACHED)', () => {
  for (const cycle of [MAX_CYCLES + 1, 9]) {
    const terminal = expectTerminal(enterCycle(cycle));
    assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
    assert.ok(terminal.reason.includes(`ciclo ${cycle}`));
    assert.ok(terminal.reason.includes('excede o limite'));
  }
});

test('LOOP-03: requestNextCycle do ciclo 5 esbarra no limite; do ciclo 4 avança', () => {
  const atFive = expectContinue(enterCycle(MAX_CYCLES));
  const terminal = expectTerminal(requestNextCycle(atFive));
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');

  const atFour = expectContinue(enterCycle(MAX_CYCLES - 1));
  const advanced = expectContinue(requestNextCycle(atFour));
  assert.equal(advanced.cycle, MAX_CYCLES);
  assert.equal(advanced.iteration, 1);
});

test('LOOP-03: ciclo ou iteração inválidos lançam DomainError fail-closed', () => {
  assert.throws(
    () => enterCycle(0),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_CYCLE');
      return true;
    },
  );
  assert.throws(
    () => enterCycle(1.5),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_CYCLE');
      return true;
    },
  );
  assert.throws(
    () => enterCycle(1, 0),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_ITERATION');
      return true;
    },
  );
  assert.throws(
    () => enterCycle(1, -2),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_ITERATION');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// LOOP-04 — FINAL_REMEDIATION: máx. 2 rounds, extensão exclusiva do ciclo 5
// ---------------------------------------------------------------------------

test('LOOP-04: MAX_FINAL_REMEDIATION_ROUNDS é 2 e os rounds 1-2 estendem o ciclo 5', () => {
  assert.equal(MAX_FINAL_REMEDIATION_ROUNDS, 2);
  const atFive = expectContinue(enterCycle(MAX_CYCLES, 2));
  const roundOne = expectContinue(requestFinalRemediationRound(atFive));
  assert.equal(roundOne.state, 'REMEDIATING');
  assert.equal(roundOne.cycle, MAX_CYCLES);
  assert.equal(roundOne.iteration, 2);
  assert.equal(roundOne.finalRemediationRound, 1);
  const roundTwo = expectContinue(requestFinalRemediationRound(roundOne));
  assert.equal(roundTwo.state, 'REMEDIATING');
  assert.equal(roundTwo.cycle, MAX_CYCLES);
  assert.equal(roundTwo.finalRemediationRound, 2);
});

test('LOOP-04: round 3 de FINAL_REMEDIATION reprova em MAX_ITERATIONS_REACHED sem virar ciclo 6', () => {
  const atFive = expectContinue(enterCycle(MAX_CYCLES));
  const roundOne = expectContinue(requestFinalRemediationRound(atFive));
  const roundTwo = expectContinue(requestFinalRemediationRound(roundOne));
  const terminal = expectTerminal(requestFinalRemediationRound(roundTwo));
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
  assert.ok(terminal.reason.includes('FINAL_REMEDIATION'));
  assert.ok(terminal.reason.includes('nunca ciclo 6'));
});

test('LOOP-04: FINAL_REMEDIATION fora do ciclo 5 lança DomainError fail-closed', () => {
  for (const cycle of [1, MAX_CYCLES - 1]) {
    const position = expectContinue(enterCycle(cycle));
    assert.throws(
      () => requestFinalRemediationRound(position),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, 'INVALID_FINAL_REMEDIATION_CYCLE');
        return true;
      },
    );
  }
});

// ---------------------------------------------------------------------------
// LOOP-05 — loop-state versionado com branch, SHA-base, status e iteração
// ---------------------------------------------------------------------------

test('LOOP-05: loop-state serializa e recupera branch, SHA-base, status e iteração (round-trip)', () => {
  const document = buildDocument({ status: 'TESTING', cycle: 4, iteration: 3 });
  const raw = serializeLoopState(document);
  const payload = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(payload['schemaVersion'], LOOP_STATE_SCHEMA_VERSION);
  assert.equal(payload['branch'], document.branch);
  assert.equal(payload['shaBase'], document.shaBase);
  assert.equal(payload['status'], document.status);
  assert.equal(payload['cycle'], document.cycle);
  assert.equal(payload['iteration'], document.iteration);
  assert.deepEqual(deserializeLoopState(raw), document);
});

// ---------------------------------------------------------------------------
// LOOP-06 — retomada por checkpoint compatível (branch + SHA-base)
// ---------------------------------------------------------------------------

test('LOOP-06: resumeLoop com checkpoint compatível retoma no passo registrado', () => {
  const document = buildDocument({ status: 'TESTING', cycle: 3, iteration: 4 });
  const position = expectContinue(resumeLoop(document, buildReality()));
  assert.deepEqual(position, {
    cycle: 3,
    iteration: 4,
    finalRemediationRound: 0,
    state: 'TESTING',
  });
});

test('LOOP-06: branch divergente entre loop-state e working tree sinaliza BLOCKED_NEEDS_HUMAN', () => {
  const document = buildDocument();
  const reality = buildReality({
    workingTree: matchingTree({ branch: 'outra-branch' }),
  });
  const terminal = expectTerminal(resumeLoop(document, reality));
  assert.equal(terminal.state, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(terminal.reason.includes('branch'));
  assert.ok(terminal.reason.includes('outra-branch'));
});

test('LOOP-06: SHA-base divergente entre loop-state e working tree sinaliza BLOCKED_NEEDS_HUMAN', () => {
  const document = buildDocument();
  const reality = buildReality({
    workingTree: matchingTree({ shaBase: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }),
  });
  const terminal = expectTerminal(resumeLoop(document, reality));
  assert.equal(terminal.state, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(terminal.reason.includes('SHA-base'));
});

test('LOOP-06: checkpoint em estado terminal consistente retoma o próprio estado terminal', () => {
  for (const status of TERMINAL_STATES) {
    const document = buildDocument({ status });
    const terminal = expectTerminal(resumeLoop(document, buildReality()));
    assert.equal(terminal.state, status);
    assert.ok(terminal.reason.includes('estado terminal'));
  }
});

test('LOOP-06: round de FINAL_REMEDIATION persistido é restaurado (sem zerar o contador)', () => {
  // Round 2 persistido no checkpoint → retomada mantém o round 2 → round 3 é proibido.
  const document = buildDocument({
    status: 'REMEDIATING',
    cycle: MAX_CYCLES,
    iteration: 3,
    finalRemediationRound: 2,
  });
  const position = expectContinue(resumeLoop(document, buildReality()));
  assert.deepEqual(position, {
    cycle: MAX_CYCLES,
    iteration: 3,
    finalRemediationRound: 2,
    state: 'REMEDIATING',
  });
  const terminal = expectTerminal(requestFinalRemediationRound(position));
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
  assert.ok(terminal.reason.includes('FINAL_REMEDIATION'));
});

// ---------------------------------------------------------------------------
// LOOP-07 — contradição loop-state × working tree/evidências → BLOCKED_NEEDS_HUMAN
// ---------------------------------------------------------------------------

test('LOOP-07: realidade consistente não produz contradições', () => {
  const contradictions = detectContradictions(buildDocument(), buildReality());
  assert.equal(contradictions.length, 0);
  assert.ok(Object.isFrozen(contradictions));
});

test('LOOP-07: posição impossível (ciclo 9, iteração 1) é contradição fail-closed', () => {
  const document = buildDocument({ cycle: 9, iteration: 1 });
  const contradictions = detectContradictions(document, buildReality());
  assert.equal(contradictions.length, 1);
  assert.ok(contradictions[0]?.includes('posição impossível'));
  assert.ok(contradictions[0]?.includes('ciclo 9'));
  const terminal = expectTerminal(resumeLoop(document, buildReality()));
  assert.equal(terminal.state, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(terminal.reason.includes('contradição'));
});

test('LOOP-07: status de sucesso com critérios pendentes é contradição fail-closed', () => {
  const document = buildDocument({ status: SUCCESS_TERMINAL });
  const reality = buildReality({ pendingCriteria: ['LOOP-09'] });
  const contradictions = detectContradictions(document, reality);
  assert.equal(contradictions.length, 1);
  assert.ok(contradictions[0]?.includes('READY_FOR_HUMAN_REVIEW'));
  assert.ok(contradictions[0]?.includes('pendente'));
  const terminal = expectTerminal(resumeLoop(document, reality));
  assert.equal(terminal.state, 'BLOCKED_NEEDS_HUMAN');
  assert.ok(terminal.reason.includes('contradição'));
});

test('LOOP-07: trabalho externo inesperado é contradição; loop-state.md nunca conta', () => {
  const document = buildDocument();
  const dirty = buildReality({
    externalChanges: ['src/core/loop.ts', 'docs/sprints/sprint-0/spec.md'],
  });
  const contradictions = detectContradictions(document, dirty);
  assert.equal(contradictions.length, 1);
  assert.ok(contradictions[0]?.includes('trabalho externo inesperado'));
  assert.ok(contradictions[0]?.includes('src/core/loop.ts'));

  const onlyLoopState = buildReality({
    externalChanges: [
      'loop-state.md',
      'docs/sprints/sprint-0/loop-state.md',
      'docs\\sprints\\sprint-0\\loop-state.md',
    ],
  });
  assert.equal(detectContradictions(document, onlyLoopState).length, 0);

  const terminal = expectTerminal(resumeLoop(document, dirty));
  assert.equal(terminal.state, 'BLOCKED_NEEDS_HUMAN');
});

test('LOOP-07: branch e SHA-base divergentes também são contradições do loop-state', () => {
  const document = buildDocument({ branch: 'doc-branch', shaBase: 'aaaa' });
  const reality = buildReality({
    workingTree: matchingTree({ branch: 'tree-branch', shaBase: 'bbbb' }),
  });
  const contradictions = detectContradictions(document, reality);
  assert.equal(contradictions.length, 2);
  assert.ok(contradictions[0]?.includes('branch divergente'));
  assert.ok(contradictions[1]?.includes('SHA-base divergente'));
});

// ---------------------------------------------------------------------------
// LOOP-09 — 6 condições exclusivas de sucesso, verificáveis uma a uma
// ---------------------------------------------------------------------------

test('LOOP-09: SUCCESS_CONDITION_IDS declara exatamente as 6 condições exclusivas', () => {
  assert.deepEqual(
    [...SUCCESS_CONDITION_IDS],
    [
      'criteriaComplete',
      'evidencePerCriterion',
      'gatesAndTestsPass',
      'documentationComplete',
      'noBlockingFindings',
      'loopStateComplete',
    ],
  );
});

test('LOOP-09: evidência completa satisfaz as 6 condições de sucesso', () => {
  const verdict = evaluateSuccess(buildEvidence());
  assert.equal(verdict.ok, true);
  if (!verdict.ok) {
    assert.fail('evidência completa deveria satisfazer as condições');
  }
  assert.deepEqual([...verdict.met], [...SUCCESS_CONDITION_IDS]);
  assert.doesNotThrow(() => assertReadyForHumanReview(buildEvidence()));
});

test('LOOP-09: critério não concluído reprova apenas criteriaComplete', () => {
  expectUnmet(
    buildEvidence({
      criteria: [{ criterionId: 'LOOP-03', completed: false, evidence: 'em andamento' }],
    }),
    ['criteriaComplete'],
  );
  expectUnmet(buildEvidence({ criteria: [] }), ['criteriaComplete', 'evidencePerCriterion']);
});

test('LOOP-09: critério sem evidência reprova apenas evidencePerCriterion', () => {
  expectUnmet(
    buildEvidence({
      criteria: [{ criterionId: 'LOOP-03', completed: true, evidence: '   ' }],
    }),
    ['evidencePerCriterion'],
  );
});

test('LOOP-09: gate ou teste reprovado reprova apenas gatesAndTestsPass', () => {
  expectUnmet(buildEvidence({ gates: [] }), ['gatesAndTestsPass']);
  expectUnmet(buildEvidence({ gates: [buildGate({ verdict: 'FAIL', exitCode: 1 })] }), [
    'gatesAndTestsPass',
  ]);
  const brokenTests: readonly unknown[] = [
    { executed: false, passed: 60, failed: 0 },
    { executed: true, passed: 0, failed: 0 },
    { executed: true, passed: 58, failed: 2 },
  ];
  for (const tests of brokenTests) {
    expectUnmet(buildEvidence({ tests: tests as TestEvidence }), ['gatesAndTestsPass']);
  }
});

test('LOOP-09: gatesAndTestsPass exige cobertura dos 8 GateId do catálogo', () => {
  const allGates = GATE_IDS.map((id, index) =>
    buildGate({
      gateId: id as GateId,
      command: `npm run ${id}`,
      durationMs: index * 10,
    }),
  );
  assert.ok(evaluateSuccess(buildEvidence({ gates: allGates })).ok);

  const missingOne = allGates.slice(1);
  expectUnmet(buildEvidence({ gates: missingOne }), ['gatesAndTestsPass']);

  const onlyOne = [buildGate({ gateId: 'test' as GateId, command: 'npm test' })];
  expectUnmet(buildEvidence({ gates: onlyOne }), ['gatesAndTestsPass']);
});

test('LOOP-09: documentação incompleta reprova apenas documentationComplete', () => {
  expectUnmet(buildEvidence({ documentationComplete: false }), ['documentationComplete']);
});

test('LOOP-09: achado BLOCKER/HIGH/MEDIUM reprova apenas noBlockingFindings', () => {
  for (const severity of ['BLOCKER', 'HIGH', 'MEDIUM'] as const) {
    expectUnmet(buildEvidence({ findings: [buildFinding({ severity })] }), ['noBlockingFindings']);
  }
  const verdict = evaluateSuccess(buildEvidence({ findings: [buildFinding({ severity: 'LOW' })] }));
  assert.equal(verdict.ok, true);
});

test('LOOP-09: loop-state incompleto reprova apenas loopStateComplete', () => {
  expectUnmet(buildEvidence({ loopStateComplete: false }), ['loopStateComplete']);
});

test('LOOP-09: assertReadyForHumanReview lança SuccessConditionsUnmetError com unmet', () => {
  assert.throws(
    () =>
      assertReadyForHumanReview(
        buildEvidence({ documentationComplete: false, loopStateComplete: false }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof SuccessConditionsUnmetError);
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'SUCCESS_CONDITIONS_UNMET');
      assert.deepEqual([...error.unmet], ['documentationComplete', 'loopStateComplete']);
      assert.ok(error.message.includes('READY_FOR_HUMAN_REVIEW'));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// LOOP-10 — evidência obrigatória por estado terminal; ausência → erro tipado
// ---------------------------------------------------------------------------

test('LOOP-10: todos os estados terminais aceitam evidência estruturada válida', () => {
  for (const state of TERMINAL_STATES) {
    assert.doesNotThrow(() => assertTerminalEvidence(state, buildEvidence()));
  }
});

test('LOOP-10: gates ausentes ou malformados lançam TerminalEvidenceError (pillar gates)', () => {
  const brokenGates: readonly unknown[] = [
    [],
    'não é lista',
    [buildGate({ command: '   ' })],
    [buildGate({ exitCode: -1 })],
    [buildGate({ exitCode: 1.5 })],
    [buildGate({ verdict: 'SKIP' as never })],
  ];
  for (const gates of brokenGates) {
    assert.throws(
      () =>
        assertTerminalEvidence(
          'BLOCKED_NEEDS_HUMAN',
          buildEvidence({
            gates: gates as readonly GateResult[],
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TerminalEvidenceError);
        assert.equal(error.code, 'TERMINAL_EVIDENCE_MISSING');
        assert.equal(error.state, 'BLOCKED_NEEDS_HUMAN');
        assert.equal(error.pillar, 'gates');
        return true;
      },
    );
  }
});

test('LOOP-10: testes ausentes ou malformados lançam TerminalEvidenceError (pillar tests)', () => {
  const brokenTests: readonly unknown[] = [
    undefined,
    null,
    'executado',
    {},
    { executed: 'yes', passed: 1, failed: 0 },
    { executed: true, passed: -1, failed: 0 },
    { executed: true, passed: 1, failed: 1.5 },
  ];
  for (const tests of brokenTests) {
    assert.throws(
      () =>
        assertTerminalEvidence(
          'BLOCKED_NEEDS_HUMAN',
          buildEvidence({
            tests: tests as TestEvidence,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TerminalEvidenceError);
        assert.equal(error.pillar, 'tests');
        return true;
      },
    );
  }
});

test('LOOP-10: findings malformados lançam TerminalEvidenceError (pillar findings)', () => {
  const brokenFindings: readonly unknown[] = [
    'não é lista',
    [buildFinding({ id: '  ' })],
    [buildFinding({ severity: 'CRITICAL' as never })],
  ];
  for (const findings of brokenFindings) {
    assert.throws(
      () =>
        assertTerminalEvidence(
          'BLOCKED_NEEDS_HUMAN',
          buildEvidence({
            findings: findings as readonly Finding[],
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TerminalEvidenceError);
        assert.equal(error.pillar, 'findings');
        return true;
      },
    );
  }
});

test('LOOP-10: cobertura de critérios ausente lança TerminalEvidenceError (pillar criteriaCoverage)', () => {
  const brokenCriteria: readonly unknown[] = [
    [],
    'não é lista',
    [{ criterionId: '  ', completed: true, evidence: 'x' }],
    [
      { criterionId: 'LOOP-03', completed: true, evidence: 'x' },
      { criterionId: '', completed: true, evidence: 'y' },
    ],
  ];
  for (const criteria of brokenCriteria) {
    assert.throws(
      () =>
        assertTerminalEvidence(
          'BLOCKED_NEEDS_HUMAN',
          buildEvidence({
            criteria: criteria as SprintEvidence['criteria'],
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TerminalEvidenceError);
        assert.equal(error.pillar, 'criteriaCoverage');
        return true;
      },
    );
  }
});

test('LOOP-10: READY_FOR_HUMAN_REVIEW exige critério concluído com evidência', () => {
  assert.throws(
    () =>
      assertTerminalEvidence(
        SUCCESS_TERMINAL,
        buildEvidence({
          criteria: [{ criterionId: 'LOOP-03', completed: false, evidence: 'em andamento' }],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CriterionEvidenceError);
      assert.equal(error.code, 'CRITERION_EVIDENCE_MISSING');
      assert.equal(error.criterionId, 'LOOP-03');
      assert.equal(error.state, SUCCESS_TERMINAL);
      return true;
    },
  );
  assert.throws(
    () =>
      assertTerminalEvidence(
        SUCCESS_TERMINAL,
        buildEvidence({
          criteria: [{ criterionId: 'LOOP-10', completed: true, evidence: '   ' }],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CriterionEvidenceError);
      assert.equal(error.criterionId, 'LOOP-10');
      return true;
    },
  );
});

test('LOOP-10: estado não terminal lança DomainError INVALID_TERMINAL_STATE', () => {
  assert.throws(
    () => assertTerminalEvidence('PREFLIGHT' as TerminalState, buildEvidence()),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_TERMINAL_STATE');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// RV-N05 — correção de inconsistência produtor × consumidor de evidência terminal
// ---------------------------------------------------------------------------

test('RV-N05: gate UNAVAILABLE com exitCode -1 e reason preenchido é aceito', () => {
  assert.doesNotThrow(() =>
    assertTerminalEvidence(
      'BLOCKED_NEEDS_HUMAN',
      buildEvidence({
        gates: [
          buildGate({
            gateId: 'audit',
            verdict: 'UNAVAILABLE',
            exitCode: -1,
            command: '',
            reason: 'registro npm indisponível',
          }),
        ],
      }),
    ),
  );
});

test('RV-N05: gate UNAVAILABLE sem reason é rejeitado', () => {
  assert.throws(
    () =>
      assertTerminalEvidence(
        'BLOCKED_NEEDS_HUMAN',
        buildEvidence({
          gates: [
            buildGate({
              gateId: 'audit',
              verdict: 'UNAVAILABLE',
              exitCode: -1,
              command: '',
              reason: '',
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof TerminalEvidenceError);
      assert.equal(error.pillar, 'gates');
      return true;
    },
  );
});

test('RV-N05: gate PASS com exitCode 0 e command preenchido é aceito', () => {
  assert.doesNotThrow(() =>
    assertTerminalEvidence(
      'BLOCKED_NEEDS_HUMAN',
      buildEvidence({
        gates: [
          buildGate({
            gateId: 'test',
            verdict: 'PASS',
            exitCode: 0,
            command: 'npm test',
            reason: '',
          }),
        ],
      }),
    ),
  );
});

test('RV-N05: gate PASS com exitCode -1 é rejeitado', () => {
  assert.throws(
    () =>
      assertTerminalEvidence(
        'BLOCKED_NEEDS_HUMAN',
        buildEvidence({
          gates: [
            buildGate({
              gateId: 'test',
              verdict: 'PASS',
              exitCode: -1,
              command: 'npm test',
              reason: '',
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof TerminalEvidenceError);
      assert.equal(error.pillar, 'gates');
      return true;
    },
  );
});

test('RV-N05: gate FAIL com exitCode 1 e command preenchido é aceito', () => {
  assert.doesNotThrow(() =>
    assertTerminalEvidence(
      'FAILED_QUALITY_GATES',
      buildEvidence({
        gates: [
          buildGate({
            gateId: 'lint',
            verdict: 'FAIL',
            exitCode: 1,
            command: 'npm run lint',
            reason: '',
          }),
        ],
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// LoopEngine — orquestração de ciclo/round/retomada/estado terminal no journal
// ---------------------------------------------------------------------------

test('LoopEngine: construtor falha fechado para sprint, branch ou SHA-base vazios', () => {
  const journal = createRecordingSink();
  assert.throws(
    () =>
      new LoopEngine({
        sprint: '  ',
        branch: BRANCH,
        shaBase: SHA_BASE,
        journal,
        now: () => FIXED_TS,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_SPRINT');
      return true;
    },
  );
  assert.throws(
    () =>
      new LoopEngine({
        sprint: 'sprint-0',
        branch: '',
        shaBase: SHA_BASE,
        journal,
        now: () => FIXED_TS,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_BRANCH');
      return true;
    },
  );
  assert.throws(
    () =>
      new LoopEngine({
        sprint: 'sprint-0',
        branch: BRANCH,
        shaBase: ' ',
        journal,
        now: () => FIXED_TS,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'INVALID_SHA_BASE');
      return true;
    },
  );
});

test('LoopEngine: cada decisão atualiza a posição e é registrada no journal', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  assert.deepEqual(engine.current, initialPosition());

  const position = expectContinue(engine.enterCycle(2, 3));
  assert.deepEqual(engine.current, position);

  const entries = journal.readAll();
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.ok(entry !== undefined);
  assert.equal(entry.schemaVersion, JOURNAL_SCHEMA_VERSION);
  assert.equal(entry.sprint, 'sprint-0');
  assert.equal(entry.cycle, 2);
  assert.equal(entry.iteration, 3);
  assert.equal(entry.phase, 'PREFLIGHT');
  assert.equal(entry.role, 'sprint-orchestrator');
  assert.equal(entry.action, 'enterCycle');
  assert.equal(entry.result, 'CONTINUE:PREFLIGHT');
  assert.equal(entry.timestamp, FIXED_TS);
  assert.equal(entry.branch, BRANCH);
  assert.equal(entry.shaBase, SHA_BASE);
});

test('LoopEngine: conduz os 5 ciclos e reprova o avanço para o ciclo 6', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  expectContinue(engine.enterCycle(MAX_CYCLES));
  const terminal = expectTerminal(engine.requestNextCycle());
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
  assert.equal(engine.current.cycle, MAX_CYCLES);

  const entries = journal.readAll();
  assert.equal(entries.length, 2);
  const last = entries[entries.length - 1];
  assert.ok(last !== undefined);
  assert.equal(last.action, 'requestNextCycle');
  assert.equal(last.result, 'TERMINAL:MAX_ITERATIONS_REACHED');
});

test('LoopEngine: FINAL_REMEDIATION registra os rounds e reprova o round 3', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  expectContinue(engine.enterCycle(MAX_CYCLES));
  expectContinue(engine.requestFinalRemediationRound());
  expectContinue(engine.requestFinalRemediationRound());
  const terminal = expectTerminal(engine.requestFinalRemediationRound());
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
  assert.equal(engine.current.finalRemediationRound, MAX_FINAL_REMEDIATION_ROUNDS);

  const entries = journal.readAll();
  assert.equal(entries.length, 4);
  assert.equal(entries[1]?.phase, 'REMEDIATING');
  assert.equal(entries[1]?.result, 'CONTINUE:REMEDIATING');
  assert.equal(entries[3]?.result, 'TERMINAL:MAX_ITERATIONS_REACHED');
});

test('LoopEngine: resume retoma checkpoint compatível e para em incompatível', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  const document = buildDocument({ status: 'TESTING', cycle: 3, iteration: 4 });

  const position = expectContinue(engine.resume(document, buildReality()));
  assert.deepEqual(position, {
    cycle: 3,
    iteration: 4,
    finalRemediationRound: 0,
    state: 'TESTING',
  });

  const blocked = expectTerminal(
    engine.resume(document, buildReality({ workingTree: matchingTree({ shaBase: 'deadbeef' }) })),
  );
  assert.equal(blocked.state, 'BLOCKED_NEEDS_HUMAN');

  const entries = journal.readAll();
  assert.equal(entries[0]?.action, 'resume');
  assert.equal(entries[0]?.result, 'CONTINUE:TESTING');
  assert.equal(entries[1]?.result, 'TERMINAL:BLOCKED_NEEDS_HUMAN');
});

test('LoopEngine: resume restaura o round de FINAL_REMEDIATION e reprova o round seguinte', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  const document = buildDocument({
    status: 'REMEDIATING',
    cycle: MAX_CYCLES,
    iteration: 3,
    finalRemediationRound: 2,
  });

  const position = expectContinue(engine.resume(document, buildReality()));
  assert.equal(position.finalRemediationRound, 2);
  assert.equal(engine.current.finalRemediationRound, 2);

  // Sem o round persistido, o contador zeraria e este round 3 seria (incorretamente) o 1.
  const terminal = expectTerminal(engine.requestFinalRemediationRound());
  assert.equal(terminal.state, 'MAX_ITERATIONS_REACHED');
  assert.equal(engine.current.finalRemediationRound, 2);
});

test('LoopEngine: finish registra o estado terminal com evidência no journal', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  const state = engine.finish(SUCCESS_TERMINAL, buildEvidence());
  assert.equal(state, SUCCESS_TERMINAL);

  const entries = journal.readAll();
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.ok(entry !== undefined);
  assert.equal(entry.action, 'finish');
  assert.equal(entry.phase, 'REVIEWING');
  assert.equal(entry.result, 'TERMINAL:READY_FOR_HUMAN_REVIEW');
});

test('LoopEngine: finish com evidência inválida lança erro tipado sem registrar', () => {
  const journal = createRecordingSink();
  const engine = createEngine(journal);
  assert.throws(
    () =>
      engine.finish(
        SUCCESS_TERMINAL,
        buildEvidence({ documentationComplete: false, loopStateComplete: false }),
      ),
    SuccessConditionsUnmetError,
  );
  assert.throws(
    () => engine.finish('BLOCKED_NEEDS_HUMAN', buildEvidence({ gates: [] })),
    TerminalEvidenceError,
  );
  assert.equal(journal.readAll().length, 0);

  const state = engine.finish('FAILED_QUALITY_GATES', buildEvidence());
  assert.equal(state, 'FAILED_QUALITY_GATES');
  assert.equal(journal.readAll().length, 1);
});
