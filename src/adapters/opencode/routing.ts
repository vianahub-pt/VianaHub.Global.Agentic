// ADP-04 — Validação de roteamento vendor-neutral equivalente ao `/sprint-loop-check`:
// 5 sondagens, tokens exatos, zero ferramentas, sem fallback. Substituto -> INVALID_AGENT_ROUTING.
import {
  EXACT_DELEGATION,
  ROLE_CONTRACTS,
  ROUTING_PROBE_CONTRACT,
  type DelegableRole,
} from '../../core/roles.ts';
import { agentOkToken, PROTOCOL_TOKENS } from '../../core/tokens.ts';

/** Número fixo de sondagens exigido pelo `/sprint-loop-check` (5 subagentes canônicos). */
export const EXPECTED_PROBE_COUNT = 5;

/** Agentes proibidos como fallback/substituto (lista negada do orquestrador). */
export const FORBIDDEN_FALLBACK_AGENTS: readonly string[] = Object.freeze([
  ...ROLE_CONTRACTS['sprint-orchestrator'].permissions.task.deny,
]);

/** Expectativa de uma sondagem de roteamento (plano emitido pelo orquestrador). */
export interface RoutingProbeExpectation {
  readonly index: number;
  readonly agent: DelegableRole;
  readonly token: string;
}

/** Observação de uma sondagem efetivamente executada. */
export interface RoutingProbeObservation {
  readonly expectedAgent: string;
  readonly respondingAgent: string;
  readonly response: string;
  readonly toolCalls: number;
  readonly usedFallback: boolean;
}

/** Entrada da validação de roteamento (vendor-neutral). */
export interface RoutingValidationInput {
  readonly orchestratorContextValid: boolean;
  readonly probes: readonly RoutingProbeObservation[];
}

/** Vereditos de roteamento: tokens de protocolo preservados byte a byte. */
export type RoutingVerdict =
  | typeof PROTOCOL_TOKENS.INVALID_ORCHESTRATOR_CONTEXT
  | typeof PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED
  | typeof PROTOCOL_TOKENS.INVALID_AGENT_ROUTING
  | typeof PROTOCOL_TOKENS.AGENT_ROUTING_PASS;

/** Resultado estruturado e fail-closed da validação de roteamento. */
export interface RoutingValidationResult {
  readonly ok: boolean;
  readonly verdict: RoutingVerdict;
  readonly reasons: readonly string[];
}

/** Plano canônico das 5 sondagens, na ordem exata de delegação. */
export function buildProbePlan(): readonly RoutingProbeExpectation[] {
  return Object.freeze(
    EXACT_DELEGATION.map((agent, index) =>
      Object.freeze({
        index,
        agent,
        token: agentOkToken(agent),
      }),
    ),
  );
}

function fail(verdict: RoutingVerdict, reasons: readonly string[]): RoutingValidationResult {
  return Object.freeze({ ok: false, verdict, reasons: Object.freeze([...reasons]) });
}

const PASS_RESULT: RoutingValidationResult = Object.freeze({
  ok: true,
  verdict: PROTOCOL_TOKENS.AGENT_ROUTING_PASS,
  reasons: Object.freeze([]),
});

/**
 * Valida as sondagens de roteamento de forma vendor-neutral:
 * 5 sondagens, ordem exata de delegação, tokens `AGENT_OK:<agente>` byte a byte,
 * zero ferramentas e sem fallback. Agente substituto ou fallback resulta em
 * `INVALID_AGENT_ROUTING`; nunca há avanço silencioso.
 */
export function validateRouting(input: RoutingValidationInput): RoutingValidationResult {
  const reasons: string[] = [];

  if (input.orchestratorContextValid !== true) {
    return fail(PROTOCOL_TOKENS.INVALID_ORCHESTRATOR_CONTEXT, [
      'Contexto do orquestrador inválido (fail-closed).',
    ]);
  }

  if (input.probes.length !== EXPECTED_PROBE_COUNT) {
    return fail(PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED, [
      `Sondagens insuficientes: esperado ${EXPECTED_PROBE_COUNT}, obtido ${input.probes.length}.`,
    ]);
  }

  input.probes.forEach((probe, index) => {
    const plan: RoutingProbeExpectation | undefined = buildProbePlan()[index];
    if (plan === undefined) {
      reasons.push(`Sondagem ${index} fora do plano canônico.`);
      return;
    }
    if (probe.expectedAgent !== plan.agent) {
      reasons.push(
        `Ordem de delegação inválida na posição ${index}: ` +
          `esperado '${plan.agent}', obtido '${probe.expectedAgent}'.`,
      );
    }
    if (FORBIDDEN_FALLBACK_AGENTS.includes(probe.respondingAgent)) {
      reasons.push(
        `Agente de fallback proibido respondeu a sondagem ${index}: '${probe.respondingAgent}'.`,
      );
    }
    if (probe.respondingAgent !== probe.expectedAgent) {
      reasons.push(
        `Agente substituto respondeu a sondagem ${index}: ` +
          `esperado '${probe.expectedAgent}', obtido '${probe.respondingAgent}'.`,
      );
    }
    if (probe.usedFallback) {
      reasons.push(`Sondagem ${index} utilizou fallback (proibido).`);
    }
    if (probe.toolCalls !== ROUTING_PROBE_CONTRACT.allowedToolCount) {
      reasons.push(
        `Sondagem ${index} usou ${probe.toolCalls} ferramentas; ` +
          `o contrato exige ${ROUTING_PROBE_CONTRACT.allowedToolCount}.`,
      );
    }
    const expectedToken = agentOkToken(plan.agent);
    if (probe.response !== expectedToken) {
      reasons.push(
        `Token inesperado na sondagem ${index}: ` +
          `esperado '${expectedToken}', obtido '${probe.response}'.`,
      );
    }
  });

  if (reasons.length > 0) {
    return fail(PROTOCOL_TOKENS.INVALID_AGENT_ROUTING, reasons);
  }
  return PASS_RESULT;
}
