// ADP-02 — Adapter OpenCode sobre a porta AgenticAdapter do Core.
// Mapeia os 6 papéis canônicos para os agentes do OpenCode preservando modo, escopo de edição,
// permissões, somente-leitura e tokens, e valida o roteamento equivalente a `/sprint-loop-check`
// (5 sondagens, tokens exatos, zero ferramentas, sem fallback). Toda particularidade do vendor
// vive neste módulo: o Core não conhece OpenCode.
import type {
  AgenticAdapter,
  GateResolution,
  Monitor,
  RoutingStatus,
  StackProfile,
} from '../../core/ports.ts';
import { getGate, resolveGate as resolveGateCommand } from '../../core/gates.ts';
import {
  isLoopState,
  isRole,
  type GateId,
  type LoopState,
  type MonitorEvent,
  type Role,
} from '../../core/types.ts';
import {
  EXACT_DELEGATION,
  ROLE_CONTRACTS,
  ROUTING_PROBE_CONTRACT,
  type DelegableRole,
  type EditScope,
  type RoleContract,
  type RoleMode,
  type RolePermissions,
} from '../../core/roles.ts';
import { agentOkToken } from '../../core/tokens.ts';
import { DomainError, UnknownStateError } from '../../core/errors.ts';

/** Vínculo entre um papel canônico e o agente correspondente no OpenCode. */
export interface OpenCodeAgentBinding {
  readonly role: Role;
  readonly agent: string;
  readonly mode: RoleMode;
  readonly editScope: EditScope;
  readonly permissions: RolePermissions;
  readonly readOnly: boolean;
  readonly okToken: string;
}

function bind(contract: RoleContract): OpenCodeAgentBinding {
  return Object.freeze({
    role: contract.id,
    agent: contract.id,
    mode: contract.mode,
    editScope: contract.editScope,
    permissions: contract.permissions,
    readOnly: contract.readOnly,
    okToken: agentOkToken(contract.id),
  });
}

/** Mapeamento dos 6 papéis canônicos para os agentes do OpenCode (ids estáveis e imutáveis). */
export const OPENCODE_AGENT_BINDINGS: Readonly<Record<Role, OpenCodeAgentBinding>> = Object.freeze({
  'sprint-orchestrator': bind(ROLE_CONTRACTS['sprint-orchestrator']),
  'sprint-architect': bind(ROLE_CONTRACTS['sprint-architect']),
  'sprint-implementer': bind(ROLE_CONTRACTS['sprint-implementer']),
  'sprint-tester': bind(ROLE_CONTRACTS['sprint-tester']),
  'sprint-security': bind(ROLE_CONTRACTS['sprint-security']),
  'sprint-reviewer': bind(ROLE_CONTRACTS['sprint-reviewer']),
});

/** Uma sondagem de roteamento: mensagem de delegação exata e token de resposta esperado. */
export interface OpenCodeRoutingProbe {
  readonly agent: DelegableRole;
  readonly message: string;
  readonly expected: string;
}

const PROBE_MESSAGE_SUFFIX = 'não use ferramentas nem realize qualquer outra operação.';

/** As 5 sondagens de `/sprint-loop-check`, na ordem exata de delegação e sem fallback. */
export const OPENCODE_ROUTING_PROBES: readonly OpenCodeRoutingProbe[] = Object.freeze(
  EXACT_DELEGATION.map((agent) =>
    Object.freeze({
      agent,
      message:
        `${ROUTING_PROBE_CONTRACT.triggerPrefix}: retorne somente ${agentOkToken(agent)}; ` +
        PROBE_MESSAGE_SUFFIX,
      expected: agentOkToken(agent),
    }),
  ),
);

/**
 * Validação de roteamento equivalente a `/sprint-loop-check` (fail-closed):
 * exatamente as 5 sondagens, na ordem exata, com os tokens exatos e nenhuma chamada extra.
 */
export function validateRoutingProbes(responses: readonly string[]): RoutingStatus {
  for (const [index, probe] of OPENCODE_ROUTING_PROBES.entries()) {
    if (index >= responses.length) {
      return 'AGENT_ROUTING_REQUIRED';
    }
    const response = responses[index];
    if (response !== probe.expected) {
      return 'INVALID_AGENT_ROUTING';
    }
  }
  if (responses.length > OPENCODE_ROUTING_PROBES.length) {
    return 'INVALID_AGENT_ROUTING';
  }
  return 'AGENT_ROUTING_PASS';
}

/** Adapter OpenCode: porta AgenticAdapter + mapeamento de papéis + validação de roteamento. */
export class OpenCodeAdapter implements AgenticAdapter {
  #monitor: Monitor;
  #routedRoles: Role[] = [];
  #routingStatus: RoutingStatus = 'AGENT_ROUTING_REQUIRED';

  constructor(monitor: Monitor) {
    this.#monitor = monitor;
  }

  /** Papéis: os 6 IDs canônicos mapeados para os agentes do OpenCode. */
  identifyRoles(): readonly Role[] {
    return Object.keys(OPENCODE_AGENT_BINDINGS) as Role[];
  }

  /** Roteamento: resolve o roteamento dos papéis delegados (fail-closed). */
  applyRouting(roles: readonly Role[]): void {
    if (roles.length === 0) {
      this.#routedRoles = [];
      this.#routingStatus = 'AGENT_ROUTING_REQUIRED';
      return;
    }
    for (const role of roles) {
      if (!isRole(role)) {
        this.#routedRoles = [];
        this.#routingStatus = 'INVALID_AGENT_ROUTING';
        return;
      }
    }
    this.#routedRoles = [...roles];
    this.#routingStatus = 'AGENT_ROUTING_PASS';
  }

  /** Resultado do último roteamento aplicado. */
  get routedRoles(): readonly Role[] {
    return Object.freeze([...this.#routedRoles]);
  }

  /** Estado de roteamento reportado após `applyRouting`. */
  reportRoutingStatus(): RoutingStatus {
    return this.#routingStatus;
  }

  /** Gates: delega a resolução gate->comando ao Core, usando o profile da stack. */
  resolveGate(gateId: GateId, profile: StackProfile): GateResolution {
    return resolveGateCommand(getGate(gateId), profile);
  }

  /** loop-state: serialização JSON com validação fail-closed. */
  serializeLoopState(state: LoopState): string {
    if (!isLoopState(state)) {
      throw new UnknownStateError(String(state));
    }
    return JSON.stringify(state);
  }

  deserializeLoopState(serialized: string): LoopState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new DomainError(
        'LOOP_STATE_INVALID',
        'loop-state serializado não é JSON válido (fail-closed).',
      );
    }
    if (typeof parsed !== 'string') {
      throw new DomainError(
        'LOOP_STATE_INVALID',
        'loop-state desserializado não é um estado textual (fail-closed).',
      );
    }
    if (!isLoopState(parsed)) {
      throw new UnknownStateError(parsed);
    }
    return parsed;
  }

  /** Monitor: encaminha o evento ao monitor injetado (tradução é responsabilidade do adapter). */
  emit(event: MonitorEvent): void {
    this.#monitor.emit(event);
  }
}
