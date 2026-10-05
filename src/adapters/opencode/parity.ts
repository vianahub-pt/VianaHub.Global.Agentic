// ADP-08 + MIG-03 + MIG-06 — Paridade entre a semente aprovada e os artefatos derivados:
// tokens, ordem de delegação, permissões e estados terminais, mais a não-regressão do
// workflow `/sprint-loop-check` + `/sprint-loop`. Comparação estruturada, sem escrita em disco.
import { ROLES, type Role } from '../../core/types.ts';
import { TERMINAL_STATE_TOKENS, agentOkToken, PROTOCOL_TOKENS } from '../../core/tokens.ts';
import {
  EXACT_DELEGATION,
  ROLE_CONTRACTS,
  type PermissionRuleSet,
  type RoleContract,
} from '../../core/roles.ts';

/** Dimensões verificadas na paridade semente × derivados. */
export type ParityDimension =
  'tokens' | 'delegationOrder' | 'permissions' | 'terminalStates' | 'workflowCommands';

/** Divergência estruturada de uma dimensão da paridade. */
export interface ParityDiff {
  readonly dimension: ParityDimension;
  readonly key: string;
  readonly expected: string;
  readonly actual: string;
}

/** Sentinela de valor ausente em uma das pontas da comparação. */
export const PARITY_ABSENT = '<ausente>';

/** Permissões normalizadas de um papel para comparação byte a byte. */
export interface RolePermissionSnapshot {
  readonly mode: string;
  readonly readOnly: boolean;
  readonly editAllow: readonly string[];
  readonly editDeny: readonly string[];
  readonly editDenyByDefault: boolean;
  readonly bashAllow: readonly string[];
  readonly bashDeny: readonly string[];
  readonly bashDenyByDefault: boolean;
  readonly taskAllow: readonly string[];
  readonly taskDeny: readonly string[];
  readonly taskDenyByDefault: boolean;
}

/** Fotografia estruturada (vendor-neutral) de uma ponta da paridade. */
export interface ParitySnapshot {
  readonly tokens: Readonly<Record<string, string>>;
  readonly delegationOrder: readonly string[];
  readonly permissions: Readonly<Record<string, RolePermissionSnapshot>>;
  readonly terminalStates: readonly string[];
  readonly workflowCommands: readonly string[];
}

/** Relatório de paridade: `ok` somente com zero divergências (fail-closed). */
export interface ParityReport {
  readonly ok: boolean;
  readonly diffs: readonly ParityDiff[];
}

/** Comandos de workflow que não podem regredir após a migração (MIG-06). */
export const REQUIRED_WORKFLOW_COMMANDS: readonly string[] = Object.freeze([
  'sprint-loop-check',
  'sprint-loop',
]);

function buildTokens(): Readonly<Record<string, string>> {
  const tokens: Record<string, string> = {};
  for (const [name, value] of Object.entries(PROTOCOL_TOKENS)) {
    tokens[name] = value;
  }
  // RV-F01 — Apenas os 5 subagentes delegáveis possuem contrato de sondagem
  // com token AGENT_OK:<agente> nos artefatos `.opencode/agents/*.md`.
  for (const role of EXACT_DELEGATION) {
    tokens[`AGENT_OK:${role}`] = agentOkToken(role);
  }
  return Object.freeze(tokens);
}

function expandRules(rules: PermissionRuleSet): {
  allow: readonly string[];
  deny: readonly string[];
  denyByDefault: boolean;
} {
  return Object.freeze({
    allow: Object.freeze([...rules.allow]),
    deny: Object.freeze([...rules.deny]),
    denyByDefault: rules.denyByDefault,
  });
}

function buildRolePermissions(role: Role): RolePermissionSnapshot {
  const contract: RoleContract | undefined = ROLE_CONTRACTS[role];
  if (contract === undefined) {
    throw new Error(`Contrato canônico ausente para '${role}' (fail-closed).`);
  }
  const edit = expandRules({
    allow: contract.editScope.allow,
    deny: contract.editScope.deny,
    denyByDefault: contract.editScope.denyByDefault,
  });
  const bash = expandRules(contract.permissions.bash);
  const task = expandRules(contract.permissions.task);
  return Object.freeze({
    mode: contract.mode,
    readOnly: contract.readOnly,
    editAllow: edit.allow,
    editDeny: edit.deny,
    editDenyByDefault: edit.denyByDefault,
    bashAllow: bash.allow,
    bashDeny: bash.deny,
    bashDenyByDefault: bash.denyByDefault,
    taskAllow: task.allow,
    taskDeny: task.deny,
    taskDenyByDefault: task.denyByDefault,
  });
}

/**
 * Fotografia de referência derivada do contrato canônico (Core + adapter):
 * usada como parâmetro esperado da paridade e como alvo da derivação dos artefatos.
 */
export function buildContractSnapshot(): ParitySnapshot {
  const permissions: Record<string, RolePermissionSnapshot> = {};
  for (const role of ROLES) {
    permissions[role] = buildRolePermissions(role);
  }
  return Object.freeze({
    tokens: buildTokens(),
    delegationOrder: Object.freeze([...EXACT_DELEGATION]),
    permissions: Object.freeze(permissions),
    terminalStates: Object.freeze([...TERMINAL_STATE_TOKENS]),
    workflowCommands: Object.freeze([...REQUIRED_WORKFLOW_COMMANDS]),
  });
}

function compareTokenMaps(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
  diffs: ParityDiff[],
): void {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of [...keys].sort()) {
    const expectedValue = expected[key] ?? PARITY_ABSENT;
    const actualValue = actual[key] ?? PARITY_ABSENT;
    if (expectedValue !== actualValue) {
      diffs.push({
        dimension: 'tokens',
        key,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
}

function compareDelegationOrder(
  expected: readonly string[],
  actual: readonly string[],
  diffs: ParityDiff[],
): void {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const expectedValue = expected[index] ?? PARITY_ABSENT;
    const actualValue = actual[index] ?? PARITY_ABSENT;
    if (expectedValue !== actualValue) {
      diffs.push({
        dimension: 'delegationOrder',
        key: `delegationOrder[${index}]`,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
}

function compareStringSet(
  dimension: ParityDimension,
  label: string,
  expected: readonly string[],
  actual: readonly string[],
  diffs: ParityDiff[],
): void {
  const values = new Set([...expected, ...actual]);
  for (const value of [...values].sort()) {
    const inExpected = expected.includes(value);
    const inActual = actual.includes(value);
    if (inExpected !== inActual) {
      diffs.push({
        dimension,
        key: `${label}:${value}`,
        expected: inExpected ? 'presente' : PARITY_ABSENT,
        actual: inActual ? 'presente' : PARITY_ABSENT,
      });
    }
  }
}

function comparePermissions(
  expected: Readonly<Record<string, RolePermissionSnapshot>>,
  actual: Readonly<Record<string, RolePermissionSnapshot>>,
  diffs: ParityDiff[],
): void {
  const fields: readonly (keyof RolePermissionSnapshot)[] = [
    'mode',
    'readOnly',
    'editAllow',
    'editDeny',
    'editDenyByDefault',
    'bashAllow',
    'bashDeny',
    'bashDenyByDefault',
    'taskAllow',
    'taskDeny',
    'taskDenyByDefault',
  ];
  const roles = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const role of [...roles].sort()) {
    const expectedRole = expected[role];
    const actualRole = actual[role];
    if (expectedRole === undefined || actualRole === undefined) {
      diffs.push({
        dimension: 'permissions',
        key: `permissions.${role}`,
        expected: expectedRole === undefined ? PARITY_ABSENT : 'presente',
        actual: actualRole === undefined ? PARITY_ABSENT : 'presente',
      });
      continue;
    }
    for (const field of fields) {
      const expectedValue = JSON.stringify(expectedRole[field]);
      const actualValue = JSON.stringify(actualRole[field]);
      if (expectedValue !== actualValue) {
        diffs.push({
          dimension: 'permissions',
          key: `permissions.${role}.${field}`,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }
}

/**
 * Verifica a paridade semente × derivados em todas as dimensões contratadas.
 * Qualquer divergência é reportada; `ok` é verdadeiro apenas sem divergências.
 */
export function verifyParity(expected: ParitySnapshot, actual: ParitySnapshot): ParityReport {
  const diffs: ParityDiff[] = [];
  compareTokenMaps(expected.tokens, actual.tokens, diffs);
  compareDelegationOrder(expected.delegationOrder, actual.delegationOrder, diffs);
  comparePermissions(expected.permissions, actual.permissions, diffs);
  compareStringSet(
    'terminalStates',
    'terminalStates',
    expected.terminalStates,
    actual.terminalStates,
    diffs,
  );
  compareStringSet(
    'workflowCommands',
    'workflowCommands',
    expected.workflowCommands,
    actual.workflowCommands,
    diffs,
  );
  return Object.freeze({ ok: diffs.length === 0, diffs: Object.freeze(diffs) });
}
