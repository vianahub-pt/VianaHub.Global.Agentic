// GUARD-08 / CORE-12 — Roteamento fail-closed: status diferente de AGENT_ROUTING_PASS nunca
// avança — vira erro tipado (erro/estado de parada, nunca sucesso silencioso). Espelha as
// regras fail-closed de AGENTS.md e a spec ("roteamento inválido resulta em erro/estado de
// parada"), sobre o contrato vendor-neutral RoutingStatus de ports.ts.
import type { RoutingStatus } from './ports.ts';
import { DomainError } from './errors.ts';

export class InvalidRoutingError extends DomainError {
  public readonly status: string;

  constructor(status: string) {
    super(
      status === 'AGENT_ROUTING_REQUIRED' ? 'AGENT_ROUTING_REQUIRED' : 'INVALID_AGENT_ROUTING',
      `Roteamento não aprovado (status '${status}'): somente AGENT_ROUTING_PASS avança; ` +
        'roteamento inválido ou ausente é parada (fail-closed).',
    );
    this.status = status;
  }
}

/**
 * Garante aprovação de roteamento antes de qualquer avanço: somente `AGENT_ROUTING_PASS`
 * retorna; qualquer outro status (ou entrada não string) lança `InvalidRoutingError`.
 */
export function assertRoutingPass(status: unknown): RoutingStatus {
  if (status === 'AGENT_ROUTING_PASS') {
    return status;
  }
  throw new InvalidRoutingError(typeof status === 'string' ? status : String(status));
}
