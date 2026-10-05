// ROLE-01 a ROLE-05, ROLE-07, ROLE-08 — Contratos dos 6 papéis canônicos do loop de Sprint.
import { ROLES, type Role } from './types.ts';

export type RoleMode = 'primary' | 'subagent';

export type DelegableRole = Exclude<Role, 'sprint-orchestrator'>;

export interface EditScope {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly denyByDefault: boolean;
}

// RV-04 — denyByDefault explicita a postura padrão do conjunto de regras: listas vazias
// com denyByDefault: true significam "tudo negado, exceto o que estiver em allow".
export interface PermissionRuleSet {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly denyByDefault: boolean;
}

export interface RolePermissions {
  readonly bash: PermissionRuleSet;
  readonly task: PermissionRuleSet;
}

export interface RoleContract {
  readonly id: Role;
  readonly mode: RoleMode;
  readonly editScope: EditScope;
  readonly permissions: RolePermissions;
  readonly responsibilities: readonly string[];
  readonly readOnly: boolean;
}

export const EXACT_DELEGATION: readonly DelegableRole[] = [
  'sprint-architect',
  'sprint-implementer',
  'sprint-tester',
  'sprint-security',
  'sprint-reviewer',
];

export const READ_ONLY_ROLES: readonly DelegableRole[] = ['sprint-security', 'sprint-reviewer'];

export const SINGLE_WRITER_RULE = {
  ruleId: 'ROLE-04',
  maxWritersPerWorkingTree: 1,
  description: 'Escritor único por working tree: apenas um agente edita código por vez.',
} as const;

export const ROUTING_PROBE_CONTRACT = {
  ruleId: 'ROLE-07',
  triggerPrefix: 'ROUTING_PROBE_ONLY',
  allowedTools: [] as readonly string[],
  allowedToolCount: 0,
  requiredResponseFormat: 'AGENT_OK:<agente>',
  description:
    'Sondagem de roteamento: zero ferramentas e retorno somente de AGENT_OK:<agente>, ' +
    'sem explicação ou texto adicional.',
} as const;

export const EXPECTED_ROLE_COUNT = 6;

const DENY_STRUCTURAL_EDIT: readonly string[] = ['**'];

// RV-04 — task: deny explícito da semente para os subagentes (nenhuma delegação).
const DENY_TASK_DELEGATION: readonly string[] = ['**'];

export const ROLE_CONTRACTS: Readonly<Record<Role, RoleContract>> = {
  'sprint-orchestrator': {
    id: 'sprint-orchestrator',
    mode: 'primary',
    editScope: {
      allow: ['docs/sprints/**/loop-state.md'],
      deny: [],
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: {
        allow: [...EXACT_DELEGATION],
        deny: ['general', 'build', 'explore', 'scout'],
        denyByDefault: true,
      },
    },
    responsibilities: [
      'Orquestrar o loop de Sprint e validar o contexto do orquestrador.',
      'Delegar somente para os 5 subagentes canônicos.',
      'Editar somente docs/sprints/**/loop-state.md.',
      'Reportar tokens de protocolo exatos e falhar fechado em roteamento inválido.',
    ],
    readOnly: false,
  },
  'sprint-architect': {
    id: 'sprint-architect',
    mode: 'subagent',
    editScope: {
      allow: [],
      deny: DENY_STRUCTURAL_EDIT,
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: { allow: [], deny: DENY_TASK_DELEGATION, denyByDefault: true },
    },
    responsibilities: [
      'Produzir o plano técnico da Sprint em docs/sprints/<sprint-id>/spec.md.',
      'Definir contratos, critérios de aceite e critérios de teste.',
      'Não editar código: atuação somente leitura.',
    ],
    readOnly: true,
  },
  'sprint-implementer': {
    id: 'sprint-implementer',
    mode: 'subagent',
    editScope: {
      // RV-03 — Exceção R4 (decisão humana): README.md e CHANGELOG.md na raiz também entram.
      allow: [
        'docs/**',
        'src/**',
        'test/**',
        'tests/**',
        'package.json',
        'package-lock.json',
        'README.md',
        'CHANGELOG.md',
      ],
      deny: [],
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: { allow: [], deny: DENY_TASK_DELEGATION, denyByDefault: true },
    },
    responsibilities: [
      'Implementar o incremento da Sprint conforme o plano do arquiteto.',
      'Escrever código limpo, testável e alinhado às convenções.',
      'Não executar gates: gates são responsabilidade exclusiva de sprint-tester.',
    ],
    readOnly: false,
  },
  'sprint-tester': {
    id: 'sprint-tester',
    mode: 'subagent',
    editScope: {
      allow: [],
      deny: DENY_STRUCTURAL_EDIT,
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: { allow: [], deny: DENY_TASK_DELEGATION, denyByDefault: true },
    },
    responsibilities: [
      'Executar os quality gates um a um, com comando, exit code e falha.',
      'Executar testes focados somente nos caminhos declarados.',
      'Não editar código: sem edição.',
    ],
    readOnly: true,
  },
  'sprint-security': {
    id: 'sprint-security',
    mode: 'subagent',
    editScope: {
      allow: [],
      deny: DENY_STRUCTURAL_EDIT,
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: { allow: [], deny: DENY_TASK_DELEGATION, denyByDefault: true },
    },
    responsibilities: [
      'Revisar segurança de forma somente leitura.',
      'Reportar findings com severidade e critério associado.',
      'Edição negada estruturalmente.',
    ],
    readOnly: true,
  },
  'sprint-reviewer': {
    id: 'sprint-reviewer',
    mode: 'subagent',
    editScope: {
      allow: [],
      deny: DENY_STRUCTURAL_EDIT,
      denyByDefault: true,
    },
    permissions: {
      bash: { allow: [], deny: [], denyByDefault: true },
      task: { allow: [], deny: DENY_TASK_DELEGATION, denyByDefault: true },
    },
    responsibilities: [
      'Revisar qualidade e aderência ao plano de forma somente leitura.',
      'Reportar findings com severidade e critério associado.',
      'Edição negada estruturalmente.',
    ],
    readOnly: true,
  },
};

export function isExactDelegation(agent: string): agent is DelegableRole {
  return (EXACT_DELEGATION as readonly string[]).includes(agent);
}

export function assertRoleCardinality(): void {
  const count = Object.keys(ROLE_CONTRACTS).length;
  if (count !== EXPECTED_ROLE_COUNT) {
    throw new Error(
      `Cardinalidade de papéis inválida: esperado ${EXPECTED_ROLE_COUNT}, obtido ${count}.`,
    );
  }
  for (const role of ROLES) {
    if (!(role in ROLE_CONTRACTS)) {
      throw new Error(`Papel canônico ausente em ROLE_CONTRACTS: '${role}'.`);
    }
  }
  for (const id of Object.keys(ROLE_CONTRACTS)) {
    if (!(ROLES as readonly string[]).includes(id)) {
      throw new Error(`Papel desconhecido em ROLE_CONTRACTS: '${id}'.`);
    }
  }
}

assertRoleCardinality();
