// ADP-03 — Testes do mapeamento dos seis papéis canônicos para agentes OpenCode.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES, type Role } from '../src/core/types.ts';
import {
  EXACT_DELEGATION,
  EXPECTED_ROLE_COUNT,
  READ_ONLY_ROLES,
  ROLE_CONTRACTS,
} from '../src/core/roles.ts';
import { AGENT_OK_PREFIX, agentOkToken } from '../src/core/tokens.ts';
import {
  assertRoleMappingIntegrity,
  CANONICAL_ROLE_NAMES,
  getMappingByAgent,
  getRoleMapping,
  getTokenForAgent,
  isReadOnlyAgent,
  OPENCODE_DELEGATION_ORDER,
  OPENCODE_READ_ONLY_ROLES,
  OPENCODE_ROLE_MAPPINGS,
  ROLE_TOKENS,
} from '../src/adapters/opencode/role-mapping.ts';

describe('ADP-03 — mapeamento de papéis OpenCode', () => {
  it('mapeia exatamente os seis papéis canônicos, sem acréscimo nem remoção', () => {
    assert.equal(OPENCODE_ROLE_MAPPINGS.length, EXPECTED_ROLE_COUNT);
    assert.equal(OPENCODE_ROLE_MAPPINGS.length, ROLES.length);
    const mappedRoles = OPENCODE_ROLE_MAPPINGS.map((mapping) => mapping.role);
    assert.deepEqual(mappedRoles, [...ROLES]);
    for (const mapping of OPENCODE_ROLE_MAPPINGS) {
      assert.equal(mapping.agent, mapping.role);
    }
  });

  it('preserva os nomes canônicos imutáveis por papel', () => {
    assert.deepEqual(CANONICAL_ROLE_NAMES, {
      'sprint-orchestrator': 'Sprint-Orchestrator',
      'sprint-architect': 'Sprint-Architect',
      'sprint-implementer': 'Sprint-Implementer',
      'sprint-tester': 'Sprint-Tester',
      'sprint-security': 'Sprint-Security',
      'sprint-reviewer': 'Sprint-Reviewer',
    });
    for (const mapping of OPENCODE_ROLE_MAPPINGS) {
      assert.equal(mapping.canonicalName, CANONICAL_ROLE_NAMES[mapping.role]);
    }
  });

  it('preserva os tokens AGENT_OK:<agente> byte a byte', () => {
    for (const mapping of OPENCODE_ROLE_MAPPINGS) {
      const expected = `${AGENT_OK_PREFIX}${mapping.agent}`;
      assert.equal(mapping.token, expected);
      assert.equal(mapping.token, agentOkToken(mapping.role));
      assert.equal(ROLE_TOKENS[mapping.role], expected);
    }
    const tokens = new Set(OPENCODE_ROLE_MAPPINGS.map((mapping) => mapping.token));
    assert.equal(tokens.size, EXPECTED_ROLE_COUNT);
  });

  it('preserva os modos declarados no contrato (orchestrator primary, demais subagent)', () => {
    for (const mapping of OPENCODE_ROLE_MAPPINGS) {
      assert.equal(mapping.mode, ROLE_CONTRACTS[mapping.role].mode);
    }
    assert.equal(getRoleMapping('sprint-orchestrator')?.mode, 'primary');
    for (const role of ROLES) {
      if (role !== 'sprint-orchestrator') {
        assert.equal(getRoleMapping(role)?.mode, 'subagent');
      }
    }
  });

  it('preserva permissões e escopo de edição do contrato canônico', () => {
    for (const mapping of OPENCODE_ROLE_MAPPINGS) {
      const contract = ROLE_CONTRACTS[mapping.role];
      assert.deepEqual(mapping.permissions, contract.permissions);
      assert.deepEqual(mapping.editScope, contract.editScope);
    }
    const implementer = getRoleMapping('sprint-implementer');
    if (implementer === undefined) {
      assert.fail('Mapeamento de sprint-implementer ausente.');
      return;
    }
    assert.deepEqual(implementer.editScope.allow, [
      'docs/**',
      'src/**',
      'test/**',
      'tests/**',
      'package.json',
      'package-lock.json',
      'README.md',
      'CHANGELOG.md',
    ]);
    assert.equal(implementer.editScope.denyByDefault, true);
  });

  it('mantém somente-leitura estrutural de sprint-security e sprint-reviewer', () => {
    assert.deepEqual(OPENCODE_READ_ONLY_ROLES, [...READ_ONLY_ROLES]);
    assert.deepEqual(OPENCODE_READ_ONLY_ROLES, ['sprint-security', 'sprint-reviewer']);
    assert.equal(isReadOnlyAgent('sprint-security'), true);
    assert.equal(isReadOnlyAgent('sprint-reviewer'), true);
    assert.equal(isReadOnlyAgent('sprint-implementer'), false);
    assert.equal(isReadOnlyAgent('sprint-orchestrator'), false);
    assert.equal(getRoleMapping('sprint-architect')?.readOnly, true);
    assert.equal(getRoleMapping('sprint-tester')?.readOnly, true);
  });

  it('preserva a ordem exata de delegação dos 5 subagentes', () => {
    assert.equal(OPENCODE_DELEGATION_ORDER.length, EXPECTED_ROLE_COUNT - 1);
    assert.deepEqual(OPENCODE_DELEGATION_ORDER, [...EXACT_DELEGATION]);
    assert.deepEqual(OPENCODE_DELEGATION_ORDER, [
      'sprint-architect',
      'sprint-implementer',
      'sprint-tester',
      'sprint-security',
      'sprint-reviewer',
    ]);
  });

  it('resolve consultas por papel, agente e token; desconhecido retorna undefined', () => {
    for (const role of ROLES) {
      const byRole = getRoleMapping(role);
      const byAgent = getMappingByAgent(role);
      assert.ok(byRole !== undefined);
      assert.ok(byAgent !== undefined);
      assert.equal(byRole.token, getTokenForAgent(role));
    }
    assert.equal(getRoleMapping('sprint-inexistente'), undefined);
    assert.equal(getMappingByAgent('general'), undefined);
    assert.equal(getTokenForAgent('build'), undefined);
    const unknown: string = 'explorador';
    assert.equal(isReadOnlyAgent(unknown), false);
  });

  it('valida a integridade do mapeamento sem divergência (fail-closed)', () => {
    assert.doesNotThrow(() => {
      assertRoleMappingIntegrity();
    });
    const rolesCovered = new Set<Role>(OPENCODE_ROLE_MAPPINGS.map((mapping) => mapping.role));
    assert.equal(rolesCovered.size, EXPECTED_ROLE_COUNT);
  });
});
