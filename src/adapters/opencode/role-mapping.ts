// ADP-03 — Mapeamento dos seis papéis canônicos para os agentes OpenCode:
// modos, permissões e tokens preservados byte a byte (regra de dependência: adapter -> core).
import { ROLES, type Role } from '../../core/types.ts';
import { AGENT_OK_PREFIX, agentOkToken } from '../../core/tokens.ts';
import {
  EXACT_DELEGATION,
  EXPECTED_ROLE_COUNT,
  READ_ONLY_ROLES,
  ROLE_CONTRACTS,
  type EditScope,
  type RoleContract,
  type RoleMode,
  type RolePermissions,
} from '../../core/roles.ts';

/** Rótulo canônico imutável do papel (contrato de papéis). */
export type CanonicalRoleName =
  | 'Sprint-Orchestrator'
  | 'Sprint-Architect'
  | 'Sprint-Implementer'
  | 'Sprint-Tester'
  | 'Sprint-Security'
  | 'Sprint-Reviewer';

/** Mapeamento completo de um papel canônico para o agente OpenCode. */
export interface OpenCodeRoleMapping {
  readonly role: Role;
  readonly canonicalName: CanonicalRoleName;
  readonly agent: Role;
  readonly mode: RoleMode;
  readonly editScope: EditScope;
  readonly permissions: RolePermissions;
  readonly readOnly: boolean;
  readonly token: string;
}

/** Rótulos canônicos por id de papel. */
export const CANONICAL_ROLE_NAMES: Readonly<Record<Role, CanonicalRoleName>> = Object.freeze({
  'sprint-orchestrator': 'Sprint-Orchestrator',
  'sprint-architect': 'Sprint-Architect',
  'sprint-implementer': 'Sprint-Implementer',
  'sprint-tester': 'Sprint-Tester',
  'sprint-security': 'Sprint-Security',
  'sprint-reviewer': 'Sprint-Reviewer',
});

function buildMapping(role: Role): OpenCodeRoleMapping {
  const contract: RoleContract | undefined = ROLE_CONTRACTS[role];
  const canonicalName: CanonicalRoleName | undefined = CANONICAL_ROLE_NAMES[role];
  if (contract === undefined || canonicalName === undefined) {
    throw new Error(`Contrato canônico ausente para o papel '${role}' (fail-closed).`);
  }
  return Object.freeze({
    role,
    canonicalName,
    agent: role,
    mode: contract.mode,
    editScope: contract.editScope,
    permissions: contract.permissions,
    readOnly: contract.readOnly,
    token: agentOkToken(role),
  });
}

/** Mapeamento completo dos seis papéis, na ordem canônica de `ROLES`. */
export const OPENCODE_ROLE_MAPPINGS: readonly OpenCodeRoleMapping[] = Object.freeze(
  ROLES.map((role) => buildMapping(role)),
);

/** Tokens `AGENT_OK:<agente>` preservados, por papel. */
export const ROLE_TOKENS: Readonly<Record<Role, string>> = Object.freeze({
  'sprint-orchestrator': agentOkToken('sprint-orchestrator'),
  'sprint-architect': agentOkToken('sprint-architect'),
  'sprint-implementer': agentOkToken('sprint-implementer'),
  'sprint-tester': agentOkToken('sprint-tester'),
  'sprint-security': agentOkToken('sprint-security'),
  'sprint-reviewer': agentOkToken('sprint-reviewer'),
});

/** Ordem exata de delegação: lista fechada dos 5 subagentes do orquestrador. */
export const OPENCODE_DELEGATION_ORDER: readonly Role[] = Object.freeze([...EXACT_DELEGATION]);

/** Papéis estruturalmente somente leitura (`sprint-security` e `sprint-reviewer`). */
export const OPENCODE_READ_ONLY_ROLES: readonly Role[] = Object.freeze([...READ_ONLY_ROLES]);

/** Retorna o mapeamento do papel canônico, ou `undefined` se desconhecido. */
export function getRoleMapping(role: string): OpenCodeRoleMapping | undefined {
  return OPENCODE_ROLE_MAPPINGS.find((mapping) => mapping.role === role);
}

/** Retorna o mapeamento pelo nome do agente OpenCode, ou `undefined` se desconhecido. */
export function getMappingByAgent(agent: string): OpenCodeRoleMapping | undefined {
  return OPENCODE_ROLE_MAPPINGS.find((mapping) => mapping.agent === agent);
}

/** Retorna o token `AGENT_OK` exato do agente, ou `undefined` se desconhecido. */
export function getTokenForAgent(agent: string): string | undefined {
  return getMappingByAgent(agent)?.token;
}

/** Indica se o agente é estruturalmente somente leitura. */
export function isReadOnlyAgent(agent: string): boolean {
  return (OPENCODE_READ_ONLY_ROLES as readonly string[]).includes(agent);
}

/**
 * Fail-closed: valida a integridade do mapeamento (cardinalidade, tokens exatos,
 * modos, ordem de delegação e somente-leitura estrutural). Lança `Error` em
 * qualquer divergência.
 */
export function assertRoleMappingIntegrity(): void {
  if (OPENCODE_ROLE_MAPPINGS.length !== EXPECTED_ROLE_COUNT) {
    throw new Error(
      `Cardinalidade de mapeamentos inválida: esperado ${EXPECTED_ROLE_COUNT}, ` +
        `obtido ${OPENCODE_ROLE_MAPPINGS.length}.`,
    );
  }
  for (const role of ROLES) {
    const mapping = getRoleMapping(role);
    const contract: RoleContract | undefined = ROLE_CONTRACTS[role];
    if (mapping === undefined || contract === undefined) {
      throw new Error(`Papel canônico sem mapeamento OpenCode: '${role}'.`);
    }
    if (mapping.token !== `${AGENT_OK_PREFIX}${mapping.agent}`) {
      throw new Error(`Token preservado inválido para '${role}': '${mapping.token}'.`);
    }
    if (mapping.mode !== contract.mode) {
      throw new Error(`Modo não preservado para '${role}'.`);
    }
    if (mapping.readOnly !== contract.readOnly) {
      throw new Error(`Somente-leitura não preservado para '${role}'.`);
    }
    if (mapping.permissions !== contract.permissions) {
      throw new Error(`Permissões não preservadas para '${role}'.`);
    }
  }
  if (OPENCODE_DELEGATION_ORDER.length !== EXPECTED_ROLE_COUNT - 1) {
    throw new Error('Ordem de delegação inválida: esperados 5 subagentes canônicos.');
  }
  OPENCODE_DELEGATION_ORDER.forEach((agent, index) => {
    if (agent !== EXACT_DELEGATION[index]) {
      throw new Error(`Ordem de delegação não preservada na posição ${index}.`);
    }
  });
  for (const readOnlyRole of READ_ONLY_ROLES) {
    const contract: RoleContract | undefined = ROLE_CONTRACTS[readOnlyRole];
    if (!isReadOnlyAgent(readOnlyRole) || contract === undefined || contract.readOnly !== true) {
      throw new Error(`Contrato de somente leitura violado: '${readOnlyRole}'.`);
    }
  }
}

assertRoleMappingIntegrity();
