// ADP-04 — Testes da validação de roteamento vendor-neutral (5 sondagens, tokens exatos,
// zero ferramentas, sem fallback; substituto -> INVALID_AGENT_ROUTING).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXACT_DELEGATION } from '../src/core/roles.ts';
import { PROTOCOL_TOKENS } from '../src/core/tokens.ts';
import {
  buildProbePlan,
  EXPECTED_PROBE_COUNT,
  FORBIDDEN_FALLBACK_AGENTS,
  validateRouting,
  type RoutingProbeObservation,
} from '../src/adapters/opencode/routing.ts';

function validProbes(): RoutingProbeObservation[] {
  return buildProbePlan().map((expectation) => ({
    expectedAgent: expectation.agent,
    respondingAgent: expectation.agent,
    response: expectation.token,
    toolCalls: 0,
    usedFallback: false,
  }));
}

function replaceProbe(
  probes: readonly RoutingProbeObservation[],
  index: number,
  patch: Partial<RoutingProbeObservation>,
): RoutingProbeObservation[] {
  return probes.map((probe, position) =>
    position === index ? { ...probe, ...patch } : { ...probe },
  );
}

describe('ADP-04 — validação de roteamento vendor-neutral', () => {
  it('o plano de sondagens cobre os 5 subagentes na ordem exata de delegação', () => {
    const plan = buildProbePlan();
    assert.equal(plan.length, EXPECTED_PROBE_COUNT);
    assert.equal(EXPECTED_PROBE_COUNT, 5);
    assert.equal(plan.length, EXACT_DELEGATION.length);
    plan.forEach((expectation, index) => {
      assert.equal(expectation.index, index);
      assert.equal(expectation.agent, EXACT_DELEGATION[index]);
      assert.equal(expectation.token, `AGENT_OK:${EXACT_DELEGATION[index]}`);
    });
  });

  it('lista de fallback proíbe general, build, explore e scout', () => {
    for (const forbidden of ['general', 'build', 'explore', 'scout']) {
      assert.equal(FORBIDDEN_FALLBACK_AGENTS.includes(forbidden), true);
    }
  });

  it('aprova o roteamento correto com AGENT_ROUTING_PASS', () => {
    const result = validateRouting({ orchestratorContextValid: true, probes: validProbes() });
    assert.equal(result.ok, true);
    assert.equal(result.verdict, PROTOCOL_TOKENS.AGENT_ROUTING_PASS);
    assert.deepEqual(result.reasons, []);
  });

  it('agente substituto responde -> INVALID_AGENT_ROUTING', () => {
    const probes = replaceProbe(validProbes(), 2, {
      respondingAgent: 'sprint-implementer',
      response: 'AGENT_OK:sprint-implementer',
    });
    const result = validateRouting({ orchestratorContextValid: true, probes });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_AGENT_ROUTING);
    assert.equal(
      result.reasons.some((reason) => reason.includes('substituto')),
      true,
    );
  });

  it('fallback de agente proibido (general) -> INVALID_AGENT_ROUTING', () => {
    const probes = replaceProbe(validProbes(), 0, {
      respondingAgent: 'general',
      response: 'AGENT_OK:sprint-architect',
      usedFallback: true,
    });
    const result = validateRouting({ orchestratorContextValid: true, probes });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_AGENT_ROUTING);
    assert.equal(
      result.reasons.some((reason) => reason.includes('fallback')),
      true,
    );
  });

  it('qualquer uso de ferramenta na sondagem -> INVALID_AGENT_ROUTING', () => {
    const probes = replaceProbe(validProbes(), 1, { toolCalls: 1 });
    const result = validateRouting({ orchestratorContextValid: true, probes });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_AGENT_ROUTING);
    assert.equal(
      result.reasons.some((reason) => reason.includes('ferramentas')),
      true,
    );
  });

  it('token divergente (texto adicional) -> INVALID_AGENT_ROUTING', () => {
    const probes = replaceProbe(validProbes(), 4, {
      response: 'AGENT_OK:sprint-reviewer\nok',
    });
    const result = validateRouting({ orchestratorContextValid: true, probes });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_AGENT_ROUTING);
    assert.equal(
      result.reasons.some((reason) => reason.includes('Token inesperado')),
      true,
    );
  });

  it('ordem de delegação trocada -> INVALID_AGENT_ROUTING', () => {
    const probes = validProbes();
    const first = probes[0];
    const second = probes[1];
    if (first === undefined || second === undefined) {
      assert.fail('Sondagens ausentes.');
      return;
    }
    const reordered = replaceProbe(replaceProbe(validProbes(), 0, second), 1, first);
    const result = validateRouting({ orchestratorContextValid: true, probes: reordered });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_AGENT_ROUTING);
    assert.equal(
      result.reasons.some((reason) => reason.includes('Ordem de delegação')),
      true,
    );
  });

  it('sondagens ausentes -> AGENT_ROUTING_REQUIRED (routing required but not satisfied)', () => {
    const result = validateRouting({
      orchestratorContextValid: true,
      probes: validProbes().slice(0, 4),
    });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED);
  });

  it('zero sondagens -> AGENT_ROUTING_REQUIRED', () => {
    const result = validateRouting({ orchestratorContextValid: true, probes: [] });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED);
    assert.equal(EXPECTED_PROBE_COUNT, 5);
  });

  it('contexto do orquestrador inválido -> INVALID_ORCHESTRATOR_CONTEXT', () => {
    const result = validateRouting({ orchestratorContextValid: false, probes: validProbes() });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, PROTOCOL_TOKENS.INVALID_ORCHESTRATOR_CONTEXT);
  });

  it('é fail-closed: nenhuma entrada inválida resulta em AGENT_ROUTING_PASS', () => {
    const invalidCases: RoutingProbeObservation[][] = [
      replaceProbe(validProbes(), 0, { toolCalls: -1 }),
      replaceProbe(validProbes(), 0, { usedFallback: true }),
      replaceProbe(validProbes(), 0, { response: '' }),
      replaceProbe(validProbes(), 0, { expectedAgent: 'general' }),
    ];
    for (const probes of invalidCases) {
      const result = validateRouting({ orchestratorContextValid: true, probes });
      assert.equal(result.ok, false);
      assert.notEqual(result.verdict, PROTOCOL_TOKENS.AGENT_ROUTING_PASS);
    }
  });
});
