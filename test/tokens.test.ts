// ROLE-06 — Testes dos tokens de protocolo preservados byte a byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_TOKENS,
  AGENT_OK_PREFIX,
  TERMINAL_STATE_TOKENS,
  agentOkToken,
} from '../src/core/tokens.ts';

const EXPECTED_PROTOCOL_TOKENS = [
  'INVALID_ORCHESTRATOR_CONTEXT',
  'AGENT_ROUTING_REQUIRED',
  'INVALID_AGENT_ROUTING',
  'AGENT_ROUTING_PASS',
  'AGENT_OK:<agente>',
  'BLOCKED_NEEDS_HUMAN',
  'READY_FOR_HUMAN_REVIEW',
  'MAX_ITERATIONS_REACHED',
  'FAILED_QUALITY_GATES',
  'NO_TEST_RUNNER_DECLARED',
] as const;

const EXPECTED_TERMINAL_TOKENS = [
  'READY_FOR_HUMAN_REVIEW',
  'BLOCKED_NEEDS_HUMAN',
  'MAX_ITERATIONS_REACHED',
  'FAILED_QUALITY_GATES',
] as const;

test('ROLE-06: PROTOCOL_TOKENS contém exatamente os 10 tokens', () => {
  const values = Object.values(PROTOCOL_TOKENS);
  assert.equal(values.length, 10);
  assert.deepEqual(values, [...EXPECTED_PROTOCOL_TOKENS]);
  assert.deepEqual([...values].sort(), [...EXPECTED_PROTOCOL_TOKENS].sort());
  assert.equal(new Set(values).size, 10);
  assert.equal(Object.keys(PROTOCOL_TOKENS).length, 10);
});

test('ROLE-06: cada token é preservado byte a byte', () => {
  const values = Object.values(PROTOCOL_TOKENS);
  for (let index = 0; index < EXPECTED_PROTOCOL_TOKENS.length; index += 1) {
    const actual = values[index];
    const expected = EXPECTED_PROTOCOL_TOKENS[index];
    if (actual === undefined || expected === undefined) {
      throw new Error(`Token ausente na posição ${index}.`);
    }
    assert.equal(actual, expected);
    assert.equal(actual.length, expected.length);
    assert.equal(Buffer.from(actual, 'utf8').equals(Buffer.from(expected, 'utf8')), true);
  }
});

test('ROLE-06: PROTOCOL_TOKENS preserva os literais individuais', () => {
  assert.equal(PROTOCOL_TOKENS.INVALID_ORCHESTRATOR_CONTEXT, 'INVALID_ORCHESTRATOR_CONTEXT');
  assert.equal(PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED, 'AGENT_ROUTING_REQUIRED');
  assert.equal(PROTOCOL_TOKENS.INVALID_AGENT_ROUTING, 'INVALID_AGENT_ROUTING');
  assert.equal(PROTOCOL_TOKENS.AGENT_ROUTING_PASS, 'AGENT_ROUTING_PASS');
  assert.equal(PROTOCOL_TOKENS['AGENT_OK:<agente>'], 'AGENT_OK:<agente>');
  assert.equal(PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN, 'BLOCKED_NEEDS_HUMAN');
  assert.equal(PROTOCOL_TOKENS.READY_FOR_HUMAN_REVIEW, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(PROTOCOL_TOKENS.MAX_ITERATIONS_REACHED, 'MAX_ITERATIONS_REACHED');
  assert.equal(PROTOCOL_TOKENS.FAILED_QUALITY_GATES, 'FAILED_QUALITY_GATES');
  assert.equal(PROTOCOL_TOKENS.NO_TEST_RUNNER_DECLARED, 'NO_TEST_RUNNER_DECLARED');
});

test('ROLE-06: agentOkToken monta AGENT_OK:<agente> corretamente', () => {
  assert.equal(AGENT_OK_PREFIX, 'AGENT_OK:');
  assert.equal(agentOkToken('sprint-architect'), 'AGENT_OK:sprint-architect');
  assert.equal(agentOkToken('sprint-orchestrator'), 'AGENT_OK:sprint-orchestrator');
  assert.equal(agentOkToken('sprint-implementer'), 'AGENT_OK:sprint-implementer');
  assert.equal(agentOkToken('sprint-tester'), 'AGENT_OK:sprint-tester');
  assert.equal(agentOkToken('sprint-security'), 'AGENT_OK:sprint-security');
  assert.equal(agentOkToken('sprint-reviewer'), 'AGENT_OK:sprint-reviewer');
  assert.ok(agentOkToken('sprint-architect').startsWith('AGENT_OK:'));
  assert.equal(agentOkToken('<agente>'), PROTOCOL_TOKENS['AGENT_OK:<agente>']);
});

test('ROLE-06: TERMINAL_STATE_TOKENS contém os 4 estados terminais byte a byte', () => {
  const tokens = [...TERMINAL_STATE_TOKENS];
  assert.equal(tokens.length, 4);
  assert.deepEqual(tokens, [...EXPECTED_TERMINAL_TOKENS]);
  for (let index = 0; index < EXPECTED_TERMINAL_TOKENS.length; index += 1) {
    const actual = tokens[index];
    const expected = EXPECTED_TERMINAL_TOKENS[index];
    if (actual === undefined || expected === undefined) {
      throw new Error(`Token terminal ausente na posição ${index}.`);
    }
    assert.equal(actual, expected);
    assert.equal(Buffer.from(actual, 'utf8').equals(Buffer.from(expected, 'utf8')), true);
    assert.equal(PROTOCOL_TOKENS[expected], expected);
  }
});
