// CORE-06 a CORE-09 — Portas (interfaces) do Core: sem implementação vendor e sem comando
// concreto embutido. Os comandos de gate chegam exclusivamente via StackProfile.
import type { Role, LoopState, GateId, JournalEntry, MonitorEvent } from './types.ts';

export type RoutingStatus =
  'AGENT_ROUTING_PASS' | 'AGENT_ROUTING_REQUIRED' | 'INVALID_AGENT_ROUTING';

export interface Gate {
  readonly id: GateId;
  readonly order: number;
  readonly intent: string;
}

export interface GateCatalog {
  readonly gates: readonly Gate[];
}

/** Comando não-vazio — branded type (apenas tipo, sem runtime). */
export type NonEmptyString = string & { readonly __brand: 'NonEmptyString' };

/**
 * Perfil declarativo da stack. Um gate sem entrada em `commands` NUNCA resulta em comando
 * vazio: a resolução correspondente é `UNAVAILABLE` (ver `GateResolution`).
 */
export interface StackProfile {
  readonly validGateIds: readonly GateId[];
  readonly commands: Readonly<Partial<Record<GateId, NonEmptyString>>>;
}

/**
 * Resultado da resolução de um gate pelo profile (SEC-03, discriminated union):
 * `RESOLVED` só existe com comando não-vazio; sem mapeamento, `UNAVAILABLE` explícito —
 * fail-closed, sem sucesso silencioso.
 */
export type GateResolution =
  | { readonly status: 'RESOLVED'; readonly gate: Gate; readonly command: NonEmptyString }
  | { readonly status: 'UNAVAILABLE'; readonly gate: Gate; readonly reason: string };

export interface AgenticAdapter {
  identifyRoles(): readonly Role[];
  applyRouting(roles: readonly Role[]): void;
  reportRoutingStatus(): RoutingStatus;
  resolveGate(gateId: GateId, profile: StackProfile): GateResolution;
  serializeLoopState(state: LoopState): string;
  deserializeLoopState(serialized: string): LoopState;
  emit(event: MonitorEvent): void;
}

export interface JournalSink {
  append(entry: JournalEntry): void;
  readAll(): readonly JournalEntry[];
}

export interface Monitor {
  emit(event: MonitorEvent): void;
}
