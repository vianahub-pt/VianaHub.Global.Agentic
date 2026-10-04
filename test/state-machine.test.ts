// CORE-04, CORE-05, LOOP-01, LOOP-02, TST-02 — Testes da máquina de estados do loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_TERMINAL_STATES,
  TRANSITIONS,
  SUCCESS_TERMINAL,
  FAIL_CLOSED_STOP,
  assertKnownState,
  isNonTerminal,
  isTerminal,
  isSuccessTerminal,
  transition,
} from '../src/core/state-machine.ts';
import { InvalidTransitionError, UnknownStateError } from '../src/core/errors.ts';

const EXPECTED_TERMINALS = [
  'READY_FOR_HUMAN_REVIEW',
  'BLOCKED_NEEDS_HUMAN',
  'MAX_ITERATIONS_REACHED',
  'FAILED_QUALITY_GATES',
] as const;

const ALL_STATES = [...NON_TERMINAL_STATES, ...EXPECTED_TERMINALS];

test('CORE-04: a tabela cobre os 8 estados não terminais e 4 terminais', () => {
  assert.deepEqual(
    [...NON_TERMINAL_STATES],
    [
      'NOT_STARTED',
      'PREFLIGHT',
      'PLANNING',
      'IMPLEMENTING',
      'TESTING',
      'GATE_RUN',
      'REVIEWING',
      'REMEDIATING',
    ],
  );
  assert.equal(NON_TERMINAL_STATES.length, 8);
  assert.deepEqual(
    [...EXPECTED_TERMINALS],
    [
      'READY_FOR_HUMAN_REVIEW',
      'BLOCKED_NEEDS_HUMAN',
      'MAX_ITERATIONS_REACHED',
      'FAILED_QUALITY_GATES',
    ],
  );
  assert.equal(EXPECTED_TERMINALS.length, 4);
  assert.equal(ALL_STATES.length, 12);
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...NON_TERMINAL_STATES].sort());
  assert.equal(Object.keys(TRANSITIONS).length, 8);
  for (const state of ALL_STATES) {
    assert.ok(isTerminal(state) || isNonTerminal(state));
  }
});

test('CORE-04: cada transição válida da tabela funciona via transition()', () => {
  for (const from of NON_TERMINAL_STATES) {
    const targets = TRANSITIONS[from];
    assert.ok(targets.length > 0);
    for (const to of targets) {
      assert.equal(transition(from, to), to);
    }
  }
});

test('LOOP-01: tabela contém exatamente as transições declaradas do fluxo', () => {
  assert.deepEqual([...TRANSITIONS.NOT_STARTED], ['PREFLIGHT', 'BLOCKED_NEEDS_HUMAN']);
  assert.deepEqual([...TRANSITIONS.PREFLIGHT], ['PLANNING', 'BLOCKED_NEEDS_HUMAN']);
  assert.deepEqual([...TRANSITIONS.PLANNING], ['IMPLEMENTING', 'BLOCKED_NEEDS_HUMAN']);
  assert.deepEqual([...TRANSITIONS.IMPLEMENTING], ['TESTING', 'BLOCKED_NEEDS_HUMAN']);
  assert.deepEqual([...TRANSITIONS.TESTING], ['GATE_RUN', 'REMEDIATING', 'BLOCKED_NEEDS_HUMAN']);
  assert.deepEqual([...TRANSITIONS.GATE_RUN], ['REVIEWING', 'REMEDIATING', ...EXPECTED_TERMINALS]);
  assert.deepEqual([...TRANSITIONS.REVIEWING], ['REMEDIATING', ...EXPECTED_TERMINALS]);
  assert.deepEqual([...TRANSITIONS.REMEDIATING], ['IMPLEMENTING', ...EXPECTED_TERMINALS]);
});

test('RV-01: todo estado não terminal alcança BLOCKED_NEEDS_HUMAN (parada fail-closed)', () => {
  assert.equal(FAIL_CLOSED_STOP, 'BLOCKED_NEEDS_HUMAN');
  for (const from of NON_TERMINAL_STATES) {
    assert.ok(
      TRANSITIONS[from].includes('BLOCKED_NEEDS_HUMAN'),
      `${from} sem aresta de parada fail-closed`,
    );
    assert.equal(transition(from, 'BLOCKED_NEEDS_HUMAN'), 'BLOCKED_NEEDS_HUMAN');
    assert.equal(transition(from, FAIL_CLOSED_STOP), 'BLOCKED_NEEDS_HUMAN');
  }
});

test('RV-01: PREFLIGHT alcança BLOCKED_NEEDS_HUMAN (checkpoint incompatível/contradição)', () => {
  assert.ok(TRANSITIONS.PREFLIGHT.includes('BLOCKED_NEEDS_HUMAN'));
  assert.equal(transition('PREFLIGHT', 'BLOCKED_NEEDS_HUMAN'), 'BLOCKED_NEEDS_HUMAN');
});

test('RV-01: TESTING e GATE_RUN alcançam BLOCKED_NEEDS_HUMAN (NO_TEST_RUNNER_DECLARED)', () => {
  assert.ok(TRANSITIONS.TESTING.includes('BLOCKED_NEEDS_HUMAN'));
  assert.ok(TRANSITIONS.GATE_RUN.includes('BLOCKED_NEEDS_HUMAN'));
  assert.equal(transition('TESTING', 'BLOCKED_NEEDS_HUMAN'), 'BLOCKED_NEEDS_HUMAN');
  assert.equal(transition('GATE_RUN', 'BLOCKED_NEEDS_HUMAN'), 'BLOCKED_NEEDS_HUMAN');
});

test('RV-02: REVIEWING não transiciona para IMPLEMENTING', () => {
  assert.equal(TRANSITIONS.REVIEWING.includes('IMPLEMENTING'), false);
  assert.throws(
    () => transition('REVIEWING', 'IMPLEMENTING'),
    (error: unknown) => {
      assert.ok(error instanceof InvalidTransitionError);
      assert.equal(error.from, 'REVIEWING');
      assert.equal(error.to, 'IMPLEMENTING');
      return true;
    },
  );
  assert.equal(transition('REVIEWING', 'REMEDIATING'), 'REMEDIATING');
  assert.equal(transition('REMEDIATING', 'IMPLEMENTING'), 'IMPLEMENTING');
});

test('CORE-05: transição inválida lança InvalidTransitionError tipado', () => {
  const invalidPairs: Array<readonly [string, string]> = [
    ['NOT_STARTED', 'IMPLEMENTING'],
    ['PREFLIGHT', 'IMPLEMENTING'],
    ['PLANNING', 'TESTING'],
    ['IMPLEMENTING', 'GATE_RUN'],
    ['TESTING', 'REVIEWING'],
    ['GATE_RUN', 'IMPLEMENTING'],
    ['REVIEWING', 'IMPLEMENTING'],
  ];
  for (const [from, to] of invalidPairs) {
    assert.throws(
      () => transition(from as never, to as never),
      (error: unknown) => {
        assert.ok(error instanceof InvalidTransitionError);
        assert.ok(error instanceof Error);
        assert.equal(error.from, from);
        assert.equal(error.to, to);
        return true;
      },
    );
  }
});

test('CORE-05: PREFLIGHT para READY_FOR_HUMAN_REVIEW lança erro tipado', () => {
  assert.throws(
    () => transition('PREFLIGHT', 'READY_FOR_HUMAN_REVIEW'),
    (error: unknown) => {
      assert.ok(error instanceof InvalidTransitionError);
      assert.ok(error instanceof Error);
      assert.equal(error.from, 'PREFLIGHT');
      assert.equal(error.to, 'READY_FOR_HUMAN_REVIEW');
      assert.equal(error.code, 'INVALID_TRANSITION');
      assert.ok(error.message.includes('PREFLIGHT'));
      assert.ok(error.message.includes('READY_FOR_HUMAN_REVIEW'));
      return true;
    },
  );
});

test('CORE-04: estados terminais não têm transição de saída', () => {
  for (const from of EXPECTED_TERMINALS) {
    for (const to of ALL_STATES) {
      assert.throws(() => transition(from, to), InvalidTransitionError);
    }
  }
});

test('LOOP-02: isTerminal e isNonTerminal classificam corretamente', () => {
  for (const state of NON_TERMINAL_STATES) {
    assert.equal(isTerminal(state), false);
    assert.equal(isNonTerminal(state), true);
  }
  for (const state of EXPECTED_TERMINALS) {
    assert.equal(isTerminal(state), true);
    assert.equal(isNonTerminal(state), false);
  }
});

test('LOOP-02: isSuccessTerminal é true somente para READY_FOR_HUMAN_REVIEW', () => {
  assert.equal(SUCCESS_TERMINAL, 'READY_FOR_HUMAN_REVIEW');
  for (const state of EXPECTED_TERMINALS) {
    assert.equal(isSuccessTerminal(state), state === 'READY_FOR_HUMAN_REVIEW');
  }
  assert.equal(isSuccessTerminal('READY_FOR_HUMAN_REVIEW'), true);
  assert.equal(isSuccessTerminal('BLOCKED_NEEDS_HUMAN'), false);
  assert.equal(isSuccessTerminal('MAX_ITERATIONS_REACHED'), false);
  assert.equal(isSuccessTerminal('FAILED_QUALITY_GATES'), false);
  for (const state of NON_TERMINAL_STATES) {
    assert.equal(isSuccessTerminal(state), false);
  }
});

test('CORE-05: estado desconhecido lança UnknownStateError', () => {
  assert.throws(() => assertKnownState('RUNNING'), UnknownStateError);
  assert.throws(() => assertKnownState(''), UnknownStateError);
  assert.throws(() => assertKnownState('not_started'), UnknownStateError);
  assert.throws(() => assertKnownState('DONE'), UnknownStateError);
  assert.throws(
    () => transition('RUNNING' as never, 'PREFLIGHT'),
    (error: unknown) => {
      assert.ok(error instanceof UnknownStateError);
      assert.ok(error instanceof Error);
      assert.equal(error.state, 'RUNNING');
      assert.equal(error.code, 'UNKNOWN_STATE');
      return true;
    },
  );
  assert.throws(
    () => transition('PREFLIGHT', 'NOPE' as never),
    (error: unknown) => {
      assert.ok(error instanceof UnknownStateError);
      assert.equal(error.state, 'NOPE');
      return true;
    },
  );
  assert.doesNotThrow(() => assertKnownState('PREFLIGHT'));
  assert.doesNotThrow(() => assertKnownState('READY_FOR_HUMAN_REVIEW'));
});
