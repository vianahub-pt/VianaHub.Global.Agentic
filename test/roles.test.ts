// ROLE-01 a ROLE-05, ROLE-07, ROLE-08 — Testes dos contratos dos papéis canônicos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_CONTRACTS,
  EXACT_DELEGATION,
  READ_ONLY_ROLES,
  SINGLE_WRITER_RULE,
  ROUTING_PROBE_CONTRACT,
  EXPECTED_ROLE_COUNT,
  assertRoleCardinality,
  isExactDelegation,
  type RoleContract,
} from '../src/core/roles.ts';
import { ROLES, type Role } from '../src/core/types.ts';

const EXPECTED_ROLE_IDS = [
  'sprint-orchestrator',
  'sprint-architect',
  'sprint-implementer',
  'sprint-tester',
  'sprint-security',
  'sprint-reviewer',
] as const;

const CONTRACT_ENTRIES: Array<readonly [Role, RoleContract]> = EXPECTED_ROLE_IDS.map((id) => {
  return [id, ROLE_CONTRACTS[id]] as const;
});

test('ROLE-08: exatamente 6 IDs canônicos, sem acréscimo ou remoção', () => {
  assert.equal(EXPECTED_ROLE_COUNT, 6);
  assert.equal(Object.keys(ROLE_CONTRACTS).length, 6);
  assert.deepEqual(Object.keys(ROLE_CONTRACTS).sort(), [...ROLES].sort());
  assert.deepEqual([...EXPECTED_ROLE_IDS].sort(), [...ROLES].sort());
  assert.deepEqual([...EXPECTED_ROLE_IDS], [...ROLES]);
  assert.doesNotThrow(() => assertRoleCardinality());
  for (const [key, contract] of CONTRACT_ENTRIES) {
    assert.equal(contract.id, key);
  }
});

test('ROLE-01: cada contrato tem modo, escopo de edição, permissões e responsabilidades', () => {
  assert.equal(CONTRACT_ENTRIES.length, 6);
  for (const [, contract] of CONTRACT_ENTRIES) {
    assert.ok(contract.mode === 'primary' || contract.mode === 'subagent');
    assert.equal(typeof contract.readOnly, 'boolean');
    assert.ok(Array.isArray(contract.editScope.allow));
    assert.ok(Array.isArray(contract.editScope.deny));
    assert.equal(typeof contract.editScope.denyByDefault, 'boolean');
    assert.ok(Array.isArray(contract.permissions.bash.allow));
    assert.ok(Array.isArray(contract.permissions.bash.deny));
    assert.equal(typeof contract.permissions.bash.denyByDefault, 'boolean');
    assert.ok(Array.isArray(contract.permissions.task.allow));
    assert.ok(Array.isArray(contract.permissions.task.deny));
    assert.equal(typeof contract.permissions.task.denyByDefault, 'boolean');
    assert.ok(contract.responsibilities.length > 0);
    for (const responsibility of contract.responsibilities) {
      assert.equal(typeof responsibility, 'string');
      assert.ok(responsibility.length > 0);
    }
    for (const pattern of [...contract.editScope.allow, ...contract.editScope.deny]) {
      assert.equal(typeof pattern, 'string');
      assert.ok(pattern.length > 0);
    }
  }
});

test('ROLE-01: sprint-orchestrator é primary e edita somente loop-state.md', () => {
  const orchestrator = ROLE_CONTRACTS['sprint-orchestrator'];
  assert.equal(orchestrator.mode, 'primary');
  assert.equal(orchestrator.readOnly, false);
  assert.deepEqual([...orchestrator.editScope.allow], ['docs/sprints/**/loop-state.md']);
  assert.equal(orchestrator.editScope.denyByDefault, true);
});

test('ROLE-01: sprint-implementer tem allow-list e deny-by-default', () => {
  const implementer = ROLE_CONTRACTS['sprint-implementer'];
  assert.equal(implementer.mode, 'subagent');
  assert.equal(implementer.readOnly, false);
  assert.deepEqual(
    [...implementer.editScope.allow],
    [
      'docs/**',
      'src/**',
      'test/**',
      'tests/**',
      'package.json',
      'package-lock.json',
      'README.md',
      'CHANGELOG.md',
    ],
  );
  assert.equal(implementer.editScope.denyByDefault, true);
});

test('RV-03: sprint-implementer inclui README.md e CHANGELOG.md (exceção R4)', () => {
  const implementer = ROLE_CONTRACTS['sprint-implementer'];
  assert.ok(implementer.editScope.allow.includes('README.md'));
  assert.ok(implementer.editScope.allow.includes('CHANGELOG.md'));
  for (const required of [
    'docs/**',
    'src/**',
    'test/**',
    'tests/**',
    'package.json',
    'package-lock.json',
    'README.md',
    'CHANGELOG.md',
  ]) {
    assert.ok(implementer.editScope.allow.includes(required), `escopo sem '${required}'`);
  }
});

test('RV-04: PermissionRuleSet tem denyByDefault true em todos os papéis', () => {
  for (const [id, contract] of CONTRACT_ENTRIES) {
    assert.equal(contract.editScope.denyByDefault, true, `${id}: editScope sem deny-by-default`);
    assert.equal(contract.permissions.bash.denyByDefault, true, `${id}: bash sem deny-by-default`);
    assert.equal(contract.permissions.task.denyByDefault, true, `${id}: task sem deny-by-default`);
  }
});

test('RV-04: subagentes reproduzem o task: deny explícito da semente', () => {
  for (const id of EXACT_DELEGATION) {
    const contract = ROLE_CONTRACTS[id];
    assert.deepEqual([...contract.permissions.task.allow], []);
    assert.deepEqual([...contract.permissions.task.deny], ['**']);
    assert.equal(contract.permissions.task.denyByDefault, true);
    assert.equal(contract.permissions.bash.denyByDefault, true);
  }
  const orchestrator = ROLE_CONTRACTS['sprint-orchestrator'];
  assert.deepEqual([...orchestrator.permissions.task.allow], [...EXACT_DELEGATION]);
  assert.equal(orchestrator.permissions.task.denyByDefault, true);
  assert.equal(orchestrator.permissions.bash.denyByDefault, true);
});

test('ROLE-03: isExactDelegation aceita somente os 5 subagentes', () => {
  assert.equal(EXACT_DELEGATION.length, 5);
  assert.deepEqual(
    [...EXACT_DELEGATION],
    [
      'sprint-architect',
      'sprint-implementer',
      'sprint-tester',
      'sprint-security',
      'sprint-reviewer',
    ],
  );
  for (const agent of EXACT_DELEGATION) {
    assert.equal(isExactDelegation(agent), true);
  }
});

test('ROLE-03: isExactDelegation rejeita general, build, explore, scout e desconhecidos', () => {
  const rejected = [
    'general',
    'build',
    'explore',
    'scout',
    'General',
    'Build',
    '',
    'sprint-orchestrator',
    'sprint-implementers',
    'sprint',
    'Sprint-Implementer',
    'anything-else',
  ];
  for (const agent of rejected) {
    assert.equal(isExactDelegation(agent), false);
  }
  assert.equal(isExactDelegation('general'), false);
  assert.equal(isExactDelegation('build'), false);
  assert.equal(isExactDelegation('explore'), false);
  assert.equal(isExactDelegation('scout'), false);
});

test('ROLE-03: orquestrador delega somente para os 5 subagentes canônicos', () => {
  const orchestrator = ROLE_CONTRACTS['sprint-orchestrator'];
  assert.deepEqual([...orchestrator.permissions.task.allow], [...EXACT_DELEGATION]);
  for (const banned of ['general', 'build', 'explore', 'scout']) {
    assert.ok(orchestrator.permissions.task.deny.includes(banned));
    assert.equal(isExactDelegation(banned), false);
  }
});

test('ROLE-04: SINGLE_WRITER_RULE expressa escritor único por working tree', () => {
  assert.equal(SINGLE_WRITER_RULE.ruleId, 'ROLE-04');
  assert.equal(SINGLE_WRITER_RULE.maxWritersPerWorkingTree, 1);
  assert.equal(typeof SINGLE_WRITER_RULE.description, 'string');
  assert.ok(SINGLE_WRITER_RULE.description.length > 0);
  assert.ok(SINGLE_WRITER_RULE.description.includes('working tree'));
  assert.ok(SINGLE_WRITER_RULE.description.includes('um agente'));
});

test('ROLE-05: READ_ONLY_ROLES lista exatamente security e reviewer', () => {
  assert.deepEqual([...READ_ONLY_ROLES], ['sprint-security', 'sprint-reviewer']);
  assert.equal(READ_ONLY_ROLES.length, 2);
});

test('ROLE-05: security e reviewer são somente leitura com edit deny estrutural', () => {
  for (const id of ['sprint-security', 'sprint-reviewer'] as const) {
    const contract = ROLE_CONTRACTS[id];
    assert.equal(contract.readOnly, true);
    assert.equal(contract.mode, 'subagent');
    assert.deepEqual([...contract.editScope.allow], []);
    assert.equal(contract.editScope.denyByDefault, true);
    assert.ok(contract.editScope.deny.includes('**'));
  }
  assert.equal(ROLE_CONTRACTS['sprint-architect'].readOnly, true);
  assert.equal(ROLE_CONTRACTS['sprint-tester'].readOnly, true);
});

test('ROLE-07: ROUTING_PROBE_CONTRACT define zero ferramentas e retorno de AGENT_OK', () => {
  assert.equal(ROUTING_PROBE_CONTRACT.ruleId, 'ROLE-07');
  assert.equal(ROUTING_PROBE_CONTRACT.allowedToolCount, 0);
  assert.equal(ROUTING_PROBE_CONTRACT.allowedTools.length, 0);
  assert.deepEqual([...ROUTING_PROBE_CONTRACT.allowedTools], []);
  assert.equal(ROUTING_PROBE_CONTRACT.requiredResponseFormat, 'AGENT_OK:<agente>');
  assert.equal(ROUTING_PROBE_CONTRACT.triggerPrefix, 'ROUTING_PROBE_ONLY');
  assert.ok(ROUTING_PROBE_CONTRACT.description.includes('zero ferramentas'));
  assert.ok(ROUTING_PROBE_CONTRACT.description.includes('AGENT_OK:<agente>'));
});

test('ROLE-08: cardinalidade fixa resiste a papel desconhecido no contrato', () => {
  const keys = Object.keys(ROLE_CONTRACTS);
  assert.equal(keys.length, EXPECTED_ROLE_COUNT);
  assert.equal(new Set(keys).size, EXPECTED_ROLE_COUNT);
  for (const key of keys) {
    assert.ok((ROLES as readonly string[]).includes(key));
    assert.ok(isExactDelegation(key) || key === 'sprint-orchestrator');
  }
  assert.doesNotThrow(() => assertRoleCardinality());
});
