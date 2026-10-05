// TST-03 — Testes de integração do loop com adapter falso: caminho feliz e as 4 paradas
// terminais (READY_FOR_HUMAN_REVIEW, BLOCKED_NEEDS_HUMAN, MAX_ITERATIONS_REACHED e
// FAILED_QUALITY_GATES). O motor do loop, o journal em memória e o FakeAdapter são compostos
// sem vendor real, sem rede e sem credencial (TST-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeAdapter } from '../src/adapters/fake/fake-adapter.ts';
import {
  LoopEngine,
  MAX_CYCLES,
  SuccessConditionsUnmetError,
  type LoopDecision,
  type SprintEvidence,
} from '../src/core/loop.ts';
import { LOOP_STATE_SCHEMA_VERSION, type LoopStateDocument } from '../src/core/loop-state.ts';
import { MemoryJournalSink } from '../src/core/journal.ts';
import { isSuccessTerminal, transition } from '../src/core/state-machine.ts';
import {
  GATE_IDS,
  TERMINAL_STATES,
  type GateId,
  type GateResult,
  type LoopState,
  type MonitorEvent,
  type Phase,
  type Role,
  type TerminalState,
} from '../src/core/types.ts';
import { evaluateGateRun } from '../src/core/gates.ts';
import { assertRoutingPass } from '../src/core/routing.ts';
import { EXACT_DELEGATION } from '../src/core/roles.ts';

const SPRINT = 'sprint-0';
const BRANCH = 'feature/sprint-0-bootstrap-agentic-framework';
const SHA_BASE = '10f90995c9052786e1c63ae5fb44e7c347c3eb01';
const FIXED_TS = '2026-10-02T12:00:00.000Z';

const PHASE_SEQUENCE: readonly Phase[] = [
  'PREFLIGHT',
  'PLANNING',
  'IMPLEMENTING',
  'TESTING',
  'GATE_RUN',
  'REVIEWING',
];

function buildGate(overrides: Partial<GateResult> = {}): GateResult {
  return {
    gateId: 'test',
    command: 'npm run test',
    exitCode: 0,
    durationMs: 120,
    verdict: 'PASS',
    stdout: 'todos os testes passaram',
    stderr: '',
    reason: '',
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
    criteria: [
      { criterionId: 'TST-03', completed: true, evidence: 'test/loop-integration.test.ts' },
    ],
    gates: ALL_GATES_PASSING,
    tests: { executed: true, passed: 6, failed: 0 },
    findings: [],
    documentationComplete: true,
    loopStateComplete: true,
    ...overrides,
  };
}

function buildEvent(type: string, phase: Phase, role: Role): MonitorEvent {
  return {
    schemaVersion: '1',
    type,
    timestamp: FIXED_TS,
    sprintId: SPRINT,
    cycle: 1,
    iteration: 1,
    phase,
    role,
    branch: BRANCH,
    shaBase: SHA_BASE,
    payload: {},
  };
}

interface Harness {
  readonly adapter: FakeAdapter;
  readonly engine: LoopEngine;
  readonly journal: MemoryJournalSink;
}

function buildHarness(): Harness {
  const adapter = new FakeAdapter();
  const journal = new MemoryJournalSink();
  const engine = new LoopEngine({
    sprint: SPRINT,
    branch: BRANCH,
    shaBase: SHA_BASE,
    journal,
    now: () => FIXED_TS,
  });
  return { adapter, engine, journal };
}

/** Caminho das fases não terminais, do PREFLIGHT ao REVIEWING, com evento de monitor por fase. */
function walkPhases(adapter: FakeAdapter): void {
  let from: LoopState = 'NOT_STARTED';
  for (const phase of PHASE_SEQUENCE) {
    from = transition(from, phase);
    adapter.emit(buildEvent('phase_transition', phase, 'sprint-orchestrator'));
  }
  assert.equal(from, 'REVIEWING');
}

function expectTerminalState(decision: LoopDecision): TerminalState {
  if (decision.kind !== 'TERMINAL') {
    assert.fail(`esperava decisão TERMINAL, veio CONTINUE (${decision.position.state})`);
  }
  return decision.state;
}

function expectContinue(decision: LoopDecision): LoopState {
  if (decision.kind !== 'CONTINUE') {
    assert.fail(`esperava decisão CONTINUE, veio TERMINAL (${decision.state})`);
  }
  return decision.position.state;
}

function lastJournalResult(journal: MemoryJournalSink): string | undefined {
  return journal.readAll().at(-1)?.result;
}

test('TST-03: caminho feliz — do NOT_STARTED ao READY_FOR_HUMAN_REVIEW com adapter falso', () => {
  const { adapter, engine, journal } = buildHarness();

  adapter.applyRouting([...EXACT_DELEGATION]);
  assert.equal(adapter.reportRoutingStatus(), 'AGENT_ROUTING_PASS');
  assert.equal(assertRoutingPass(adapter.reportRoutingStatus()), 'AGENT_ROUTING_PASS');

  expectContinue(engine.enterCycle(1));
  walkPhases(adapter);

  adapter.emit(buildEvent('gate_result', 'GATE_RUN', 'sprint-tester'));
  const terminal = engine.finish('READY_FOR_HUMAN_REVIEW', buildEvidence());
  assert.equal(terminal, 'READY_FOR_HUMAN_REVIEW');

  const entries = journal.readAll();
  assert.ok(entries.length >= 2, 'journal sem evidência do ciclo');
  for (const entry of entries) {
    assert.equal(entry.sprint, SPRINT);
    assert.equal(entry.branch, BRANCH);
    assert.equal(entry.shaBase, SHA_BASE);
    assert.equal(entry.timestamp, FIXED_TS);
  }
  assert.equal(lastJournalResult(journal), 'TERMINAL:READY_FOR_HUMAN_REVIEW');

  const events = adapter.events;
  assert.equal(events.length, PHASE_SEQUENCE.length + 1);
  assert.equal(events[events.length - 1]?.type, 'gate_result');
});

test('TST-03: parada terminal 1 — READY_FOR_HUMAN_REVIEW só com as 6 condições de sucesso', () => {
  const { engine, journal } = buildHarness();

  const terminal = engine.finish('READY_FOR_HUMAN_REVIEW', buildEvidence());
  assert.equal(terminal, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(lastJournalResult(journal), 'TERMINAL:READY_FOR_HUMAN_REVIEW');

  const incomplete = buildEvidence({ documentationComplete: false, loopStateComplete: false });
  assert.throws(
    () => engine.finish('READY_FOR_HUMAN_REVIEW', incomplete),
    SuccessConditionsUnmetError,
  );
});

test('TST-03: parada terminal 2 — BLOCKED_NEEDS_HUMAN (checkpoint e contradição)', () => {
  const { engine, journal } = buildHarness();

  const document: LoopStateDocument = {
    schemaVersion: LOOP_STATE_SCHEMA_VERSION,
    sprintId: SPRINT,
    branch: BRANCH,
    shaBase: SHA_BASE,
    status: 'IMPLEMENTING',
    cycle: 2,
    iteration: 1,
    finalRemediationRound: 0,
  };

  // Retomada compatível: a mudança do próprio loop-state.md não é trabalho externo.
  expectContinue(
    engine.resume(document, {
      workingTree: { branch: BRANCH, shaBase: SHA_BASE },
      pendingCriteria: [],
      externalChanges: ['docs/sprints/sprint-0/loop-state.md'],
    }),
  );

  // Checkpoint incompatível (SHA-base divergente): parada, nunca avanço.
  const incompatible = engine.resume(document, {
    workingTree: { branch: BRANCH, shaBase: 'sha-base-divergente' },
    pendingCriteria: [],
    externalChanges: [],
  });
  assert.equal(expectTerminalState(incompatible), 'BLOCKED_NEEDS_HUMAN');

  // Contradição loop-state × working tree (trabalho externo inesperado): parada.
  const contradiction = engine.resume(document, {
    workingTree: { branch: BRANCH, shaBase: SHA_BASE },
    pendingCriteria: [],
    externalChanges: ['src/core/loop.ts'],
  });
  assert.equal(expectTerminalState(contradiction), 'BLOCKED_NEEDS_HUMAN');

  const terminal = engine.finish(
    'BLOCKED_NEEDS_HUMAN',
    buildEvidence({
      criteria: [{ criterionId: 'LOOP-06', completed: false, evidence: 'checkpoint incompatível' }],
    }),
  );
  assert.equal(terminal, 'BLOCKED_NEEDS_HUMAN');
  assert.equal(lastJournalResult(journal), 'TERMINAL:BLOCKED_NEEDS_HUMAN');
});

test('TST-03: parada terminal 3 — MAX_ITERATIONS_REACHED (ciclos e FINAL_REMEDIATION)', () => {
  const { engine, journal } = buildHarness();

  // Ciclo 6 nunca entra em execução: máximo de 5 ciclos.
  const sixthCycle = engine.enterCycle(MAX_CYCLES + 1);
  assert.equal(expectTerminalState(sixthCycle), 'MAX_ITERATIONS_REACHED');

  // FINAL_REMEDIATION: extensão exclusiva do ciclo 5, limitada a 2 rounds.
  const finalRound = buildHarness();
  expectContinue(finalRound.engine.enterCycle(MAX_CYCLES));
  expectContinue(finalRound.engine.requestFinalRemediationRound());
  expectContinue(finalRound.engine.requestFinalRemediationRound());
  assert.equal(
    expectTerminalState(finalRound.engine.requestFinalRemediationRound()),
    'MAX_ITERATIONS_REACHED',
  );

  const terminal = engine.finish(
    'MAX_ITERATIONS_REACHED',
    buildEvidence({
      criteria: [
        { criterionId: 'TST-04', completed: false, evidence: 'limite de ciclos atingido' },
      ],
    }),
  );
  assert.equal(terminal, 'MAX_ITERATIONS_REACHED');
  assert.equal(lastJournalResult(journal), 'TERMINAL:MAX_ITERATIONS_REACHED');
});

test('TST-03: parada terminal 4 — FAILED_QUALITY_GATES (gate reprovado nunca vira sucesso)', () => {
  const { engine, journal } = buildHarness();

  const failedGate = buildGate({
    gateId: 'lint',
    command: 'npm run lint',
    verdict: 'FAIL',
    exitCode: 2,
    stderr: 'regras de lint reprovadas',
  });
  const run = evaluateGateRun([buildGate(), failedGate]);
  assert.equal(run.allPassed, false);
  assert.equal(run.failures.length, 1);

  const evidence = buildEvidence({ gates: [buildGate(), failedGate] });
  const terminal = engine.finish('FAILED_QUALITY_GATES', evidence);
  assert.equal(terminal, 'FAILED_QUALITY_GATES');
  assert.equal(lastJournalResult(journal), 'TERMINAL:FAILED_QUALITY_GATES');

  // A mesma evidência com gate reprovado nunca alcança o estado de sucesso.
  assert.throws(
    () => engine.finish('READY_FOR_HUMAN_REVIEW', evidence),
    SuccessConditionsUnmetError,
  );
});

test('TST-03: as paradas cobrem os 4 estados terminais, sendo 1 único de sucesso', () => {
  const covered: readonly TerminalState[] = [
    'READY_FOR_HUMAN_REVIEW',
    'BLOCKED_NEEDS_HUMAN',
    'MAX_ITERATIONS_REACHED',
    'FAILED_QUALITY_GATES',
  ];
  assert.deepEqual([...covered], [...TERMINAL_STATES]);
  assert.deepEqual(
    covered.filter((state) => isSuccessTerminal(state)),
    ['READY_FOR_HUMAN_REVIEW'],
  );
});
