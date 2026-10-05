// ADP-01 / ADP-06 — Adapter falso em memória que implementa a porta AgenticAdapter do Core.
// Permite testar papéis, roteamento, gates, loop-state e monitor sem nenhuma ferramenta de IA
// real: todo o estado vive em memória (ADP-06). Correspondência com a porta: `applyRouting`
// resolve o roteamento; `reportRoutingStatus` reporta o estado de roteamento; `resolveGate`
// delega a resolução gate->comando ao Core (resolveGate) usando o StackProfile informado.
import type {
  AgenticAdapter,
  GateResolution,
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
import { DomainError, UnknownStateError } from '../../core/errors.ts';
import { ROLE_CONTRACTS } from '../../core/roles.ts';

export class FakeAdapter implements AgenticAdapter {
  #routedRoles: Role[] = [];
  #routingStatus: RoutingStatus = 'AGENT_ROUTING_REQUIRED';
  #events: MonitorEvent[] = [];

  /** Papéis: os 6 IDs canônicos declarados em `ROLE_CONTRACTS`. */
  identifyRoles(): readonly Role[] {
    return Object.keys(ROLE_CONTRACTS) as Role[];
  }

  /** Roteamento: resolve o roteamento dos papéis informados (fail-closed). */
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

  /** Monitor: acumula os eventos em memória. */
  emit(event: MonitorEvent): void {
    this.#events.push(event);
  }

  get events(): readonly MonitorEvent[] {
    return Object.freeze([...this.#events]);
  }
}
