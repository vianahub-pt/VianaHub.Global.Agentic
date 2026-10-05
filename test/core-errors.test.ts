// CORE-12 — Testes dos erros de domínio tipados e fail-closed do Core.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DomainError,
  InvalidTransitionError,
  UnknownStateError,
  CriterionEvidenceError,
} from '../src/core/errors.ts';

test('CORE-12: DomainError é base de todos os erros de domínio', () => {
  assert.ok(Object.getPrototypeOf(InvalidTransitionError.prototype) === DomainError.prototype);
  assert.ok(Object.getPrototypeOf(UnknownStateError.prototype) === DomainError.prototype);
  assert.ok(Object.getPrototypeOf(CriterionEvidenceError.prototype) === DomainError.prototype);
  const base = new DomainError('CUSTOM_CODE', 'mensagem base');
  assert.ok(base instanceof DomainError);
  assert.ok(base instanceof Error);
});

test('CORE-12: DomainError preserva code e mensagem, com name próprio', () => {
  const error = new DomainError('CUSTOM_CODE', 'mensagem base');
  assert.equal(error.code, 'CUSTOM_CODE');
  assert.equal(error.message, 'mensagem base');
  assert.equal(error.name, 'DomainError');
});

test('CORE-12: DomainError aceita code e name customizados preservando ambos', () => {
  const error = new DomainError('ANY_CODE', 'qualquer mensagem');
  assert.equal(error.code, 'ANY_CODE');
  assert.equal(error.name, 'DomainError');
  assert.ok(error instanceof Error);
});

test('CORE-12: InvalidTransitionError carrega from, to, code e mensagem clara', () => {
  const error = new InvalidTransitionError('PLANNING', 'READY_FOR_HUMAN_REVIEW');
  assert.ok(error instanceof InvalidTransitionError);
  assert.ok(error instanceof DomainError);
  assert.ok(error instanceof Error);
  assert.equal(error.from, 'PLANNING');
  assert.equal(error.to, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(error.code, 'INVALID_TRANSITION');
  assert.equal(error.name, 'InvalidTransitionError');
  assert.ok(error.message.includes('PLANNING'));
  assert.ok(error.message.includes('READY_FOR_HUMAN_REVIEW'));
  assert.ok(error.message.includes('Transição de estado inválida'));
  assert.ok(error.message.length > 0);
});

test('CORE-12: InvalidTransitionError com valores distintos preserva from e to', () => {
  const error = new InvalidTransitionError('NOT_STARTED', 'PREFLIGHT');
  assert.equal(error.from, 'NOT_STARTED');
  assert.equal(error.to, 'PREFLIGHT');
  assert.ok(error.message.includes('NOT_STARTED'));
  assert.ok(error.message.includes('PREFLIGHT'));
});

test('CORE-12: UnknownStateError instancia com estado, code e name', () => {
  const error = new UnknownStateError('RUNNING');
  assert.ok(error instanceof UnknownStateError);
  assert.ok(error instanceof DomainError);
  assert.ok(error instanceof Error);
  assert.equal(error.state, 'RUNNING');
  assert.equal(error.code, 'UNKNOWN_STATE');
  assert.equal(error.name, 'UnknownStateError');
  assert.ok(error.message.includes('RUNNING'));
  assert.ok(error.message.includes('Estado desconhecido'));
});

test('CORE-12: CriterionEvidenceError instancia com critério, estado, code e name', () => {
  const error = new CriterionEvidenceError('CORE-03', 'READY_FOR_HUMAN_REVIEW');
  assert.ok(error instanceof CriterionEvidenceError);
  assert.ok(error instanceof DomainError);
  assert.ok(error instanceof Error);
  assert.equal(error.criterionId, 'CORE-03');
  assert.equal(error.state, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(error.code, 'CRITERION_EVIDENCE_MISSING');
  assert.equal(error.name, 'CriterionEvidenceError');
  assert.ok(error.message.includes('CORE-03'));
  assert.ok(error.message.includes('READY_FOR_HUMAN_REVIEW'));
  assert.ok(error.message.includes('Evidência ausente'));
});

test('CORE-12: todas as instâncias são instanceof Error e instanceof DomainError', () => {
  const errors = [
    new DomainError('C', 'm'),
    new InvalidTransitionError('a', 'b'),
    new UnknownStateError('x'),
    new CriterionEvidenceError('CORE-05', 'BLOCKED_NEEDS_HUMAN'),
  ];
  for (const error of errors) {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof DomainError);
    assert.equal(typeof error.code, 'string');
    assert.ok(error.code.length > 0);
    assert.equal(typeof error.name, 'string');
    assert.ok(error.name.length > 0);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
    assert.equal(typeof error.stack, 'string');
  }
});

test('CORE-12: name próprio é preservado em cada subclasse', () => {
  assert.equal(new DomainError('C', 'm').name, 'DomainError');
  assert.equal(new InvalidTransitionError('a', 'b').name, 'InvalidTransitionError');
  assert.equal(new UnknownStateError('x').name, 'UnknownStateError');
  assert.equal(new CriterionEvidenceError('C', 's').name, 'CriterionEvidenceError');
});
