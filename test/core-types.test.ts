// CORE-03 — Testes dos tipos canônicos do Core.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  PHASES,
  TERMINAL_STATES,
  LOOP_STATES,
  GATE_IDS,
  SEVERITIES,
  isRole,
  isPhase,
  isTerminalState,
  isLoopState,
  isGateId,
  isSeverity,
  type Role,
  type Phase,
  type LoopState,
  type TerminalState,
  type GateId,
  type GateResult,
  type Severity,
  type Finding,
  type JournalEntry,
  type MonitorEvent,
} from '../src/core/types.ts';

test('CORE-03: constantes ROLES contêm os 6 papéis exatos', () => {
  assert.deepEqual(
    [...ROLES],
    [
      'sprint-orchestrator',
      'sprint-architect',
      'sprint-implementer',
      'sprint-tester',
      'sprint-security',
      'sprint-reviewer',
    ],
  );
  assert.equal(ROLES.length, 6);
});

test('CORE-03: constantes PHASES contêm as 7 fases exatas', () => {
  assert.deepEqual(
    [...PHASES],
    ['PREFLIGHT', 'PLANNING', 'IMPLEMENTING', 'TESTING', 'GATE_RUN', 'REVIEWING', 'REMEDIATING'],
  );
  assert.equal(PHASES.length, 7);
});

test('CORE-03: constantes TERMINAL_STATES contêm os 4 estados terminais exatos', () => {
  assert.deepEqual(
    [...TERMINAL_STATES],
    [
      'READY_FOR_HUMAN_REVIEW',
      'BLOCKED_NEEDS_HUMAN',
      'MAX_ITERATIONS_REACHED',
      'FAILED_QUALITY_GATES',
    ],
  );
  assert.equal(TERMINAL_STATES.length, 4);
});

test('CORE-03: constantes LOOP_STATES = NOT_STARTED + Phase + terminais', () => {
  assert.deepEqual([...LOOP_STATES], ['NOT_STARTED', ...PHASES, ...TERMINAL_STATES]);
  assert.equal(LOOP_STATES.length, 1 + PHASES.length + TERMINAL_STATES.length);
  assert.ok(isLoopState('NOT_STARTED'));
});

test('CORE-03: constantes GATE_IDS contêm os 8 gates exatos', () => {
  assert.deepEqual(
    [...GATE_IDS],
    ['whitespace', 'format', 'lint', 'typecheck', 'test', 'coverage', 'build', 'audit'],
  );
  assert.equal(GATE_IDS.length, 8);
});

test('CORE-03: constantes SEVERITIES contêm as 5 severidades exatas', () => {
  assert.deepEqual([...SEVERITIES], ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
  assert.equal(SEVERITIES.length, 5);
});

test('CORE-03: isRole aceita todos os papéis e rejeita desconhecidos', () => {
  for (const role of ROLES) {
    assert.ok(isRole(role));
    const typed: Role = role;
    assert.equal(typed, role);
  }
  assert.equal(isRole('admin'), false);
  assert.equal(isRole('sprint-orchestrators'), false);
  assert.equal(isRole(''), false);
  assert.equal(isRole(42), false);
  assert.equal(isRole(null), false);
  assert.equal(isRole(undefined), false);
  assert.equal(isRole({}), false);
  assert.equal(isRole(['sprint-orchestrator']), false);
});

test('CORE-03: isPhase aceita todas as fases e rejeita desconhecidos', () => {
  for (const phase of PHASES) {
    assert.ok(isPhase(phase));
    const typed: Phase = phase;
    assert.equal(typed, phase);
  }
  assert.equal(isPhase('preflight'), false);
  assert.equal(isPhase('DONE'), false);
  assert.equal(isPhase(7), false);
  assert.equal(isPhase(null), false);
  assert.equal(isPhase(undefined), false);
  assert.equal(isPhase([]), false);
});

test('CORE-03: isTerminalState aceita os terminais e rejeita desconhecidos', () => {
  for (const state of TERMINAL_STATES) {
    assert.ok(isTerminalState(state));
    const typed: TerminalState = state;
    assert.equal(typed, state);
  }
  assert.equal(isTerminalState('NOT_STARTED'), false);
  assert.equal(isTerminalState('REVIEWING'), false);
  assert.equal(isTerminalState('ready_for_human_review'), false);
  assert.equal(isTerminalState(0), false);
  assert.equal(isTerminalState(false), false);
  assert.equal(isTerminalState(null), false);
});

test('CORE-03: isLoopState aceita todos os estados do loop e rejeita desconhecidos', () => {
  for (const state of LOOP_STATES) {
    assert.ok(isLoopState(state));
    const typed: LoopState = state;
    assert.equal(typed, state);
  }
  assert.equal(isLoopState('RUNNING'), false);
  assert.equal(isLoopState('not_started'), false);
  assert.equal(isLoopState(''), false);
  assert.equal(isLoopState(123), false);
  assert.equal(isLoopState(null), false);
  assert.equal(isLoopState(undefined), false);
  assert.equal(isLoopState(Symbol('NOT_STARTED')), false);
});

test('CORE-03: isGateId aceita os 8 gates e rejeita desconhecidos', () => {
  for (const gateId of GATE_IDS) {
    assert.ok(isGateId(gateId));
    const typed: GateId = gateId;
    assert.equal(typed, gateId);
  }
  assert.equal(isGateId('format:check'), false);
  assert.equal(isGateId('Typecheck'), false);
  assert.equal(isGateId('security'), false);
  assert.equal(isGateId(8), false);
  assert.equal(isGateId(null), false);
  assert.equal(isGateId({}), false);
});

test('CORE-03: isSeverity aceita as 5 severidades e rejeita desconhecidos', () => {
  for (const severity of SEVERITIES) {
    assert.ok(isSeverity(severity));
    const typed: Severity = severity;
    assert.equal(typed, severity);
  }
  assert.equal(isSeverity('CRITICAL'), false);
  assert.equal(isSeverity('blocker'), false);
  assert.equal(isSeverity('INFO '), false);
  assert.equal(isSeverity(1), false);
  assert.equal(isSeverity(null), false);
  assert.equal(isSeverity(undefined), false);
});

test('CORE-03: GateResult tem shape canônico', () => {
  const result: GateResult = {
    gateId: 'lint',
    command: 'npm run lint',
    exitCode: 0,
    durationMs: 1200,
    verdict: 'PASS',
    stdout: 'ok',
    stderr: '',
    reason: '',
  };
  assert.equal(result.gateId, 'lint');
  assert.equal(result.command, 'npm run lint');
  assert.equal(result.exitCode, 0);
  assert.equal(result.durationMs, 1200);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.stdout, 'ok');
  assert.equal(result.stderr, '');
  const verdicts: Array<GateResult['verdict']> = ['PASS', 'FAIL', 'UNAVAILABLE'];
  for (const verdict of verdicts) {
    const candidate: GateResult = { ...result, verdict };
    assert.equal(candidate.verdict, verdict);
  }
});

test('CORE-03: Finding tem shape canônico com criterionId opcional', () => {
  const withCriterion: Finding = {
    id: 'F-001',
    severity: 'HIGH',
    title: 'Título',
    detail: 'Detalhe',
    criterionId: 'CORE-03',
  };
  const withoutCriterion: Finding = {
    id: 'F-002',
    severity: 'INFO',
    title: 'Título',
    detail: 'Detalhe',
  };
  assert.equal(withCriterion.criterionId, 'CORE-03');
  assert.equal(withoutCriterion.criterionId, undefined);
  assert.ok(isSeverity(withCriterion.severity));
  assert.ok(!('criterionId' in withoutCriterion) || withoutCriterion.criterionId === undefined);
});

test('CORE-03: JournalEntry tem shape canônico', () => {
  const entry: JournalEntry = {
    schemaVersion: '1.0',
    sprint: 'sprint-0',
    cycle: 1,
    iteration: 1,
    phase: 'IMPLEMENTING',
    role: 'sprint-implementer',
    action: 'Escrever tipos',
    result: 'TYPES_DONE',
    timestamp: '2026-10-01T00:00:00.000Z',
    branch: 'main',
    shaBase: 'abc1234',
  };
  assert.equal(entry.schemaVersion, '1.0');
  assert.equal(entry.sprint, 'sprint-0');
  assert.equal(entry.cycle, 1);
  assert.equal(entry.iteration, 1);
  assert.equal(entry.phase, 'IMPLEMENTING');
  assert.equal(entry.role, 'sprint-implementer');
  assert.equal(entry.action, 'Escrever tipos');
  assert.equal(entry.result, 'TYPES_DONE');
  assert.equal(entry.timestamp, '2026-10-01T00:00:00.000Z');
  assert.equal(entry.branch, 'main');
  assert.equal(entry.shaBase, 'abc1234');
  assert.ok(isPhase(entry.phase));
  assert.ok(isRole(entry.role));
});

test('CORE-03: MonitorEvent tem shape canônico com payload', () => {
  const event: MonitorEvent = {
    schemaVersion: '1.0',
    type: 'phase_transition',
    timestamp: '2026-10-01T00:00:00.000Z',
    sprintId: 'sprint-0',
    cycle: 1,
    iteration: 2,
    phase: 'GATE_RUN',
    role: 'sprint-tester',
    branch: 'main',
    shaBase: 'abc1234',
    payload: { gate: 'lint', verdict: 'PASS' },
  };
  assert.equal(event.schemaVersion, '1.0');
  assert.equal(event.type, 'phase_transition');
  assert.equal(event.timestamp, '2026-10-01T00:00:00.000Z');
  assert.equal(event.sprintId, 'sprint-0');
  assert.equal(event.cycle, 1);
  assert.equal(event.iteration, 2);
  assert.equal(event.phase, 'GATE_RUN');
  assert.equal(event.role, 'sprint-tester');
  assert.equal(event.branch, 'main');
  assert.equal(event.shaBase, 'abc1234');
  assert.deepEqual(event.payload, { gate: 'lint', verdict: 'PASS' });
  assert.equal(typeof event.payload, 'object');
  assert.ok(isPhase(event.phase));
  assert.ok(isRole(event.role));
});

test('CORE-03: union types aceitam exatamente os literais esperados', () => {
  const roles: Role[] = [...ROLES];
  const phases: Phase[] = [...PHASES];
  const terminals: TerminalState[] = [...TERMINAL_STATES];
  const loopStates: LoopState[] = [...LOOP_STATES];
  const gateIds: GateId[] = [...GATE_IDS];
  const severities: Severity[] = [...SEVERITIES];
  assert.equal(roles.length, ROLES.length);
  assert.equal(phases.length, PHASES.length);
  assert.equal(terminals.length, TERMINAL_STATES.length);
  assert.equal(loopStates.length, LOOP_STATES.length);
  assert.equal(gateIds.length, GATE_IDS.length);
  assert.equal(severities.length, SEVERITIES.length);
  assert.ok(loopStates.includes('NOT_STARTED'));
  assert.ok(loopStates.includes('READY_FOR_HUMAN_REVIEW'));
  assert.ok(loopStates.includes('BLOCKED_NEEDS_HUMAN'));
  assert.ok(loopStates.includes('MAX_ITERATIONS_REACHED'));
  assert.ok(loopStates.includes('FAILED_QUALITY_GATES'));
});
