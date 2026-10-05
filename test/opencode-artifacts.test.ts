// ADP-05 + MIG-02 + MIG-04 — Testes da derivação dos artefatos como PROPOSTA
// (sem aplicação automática) e da recusa tipada para alvo guardrail.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES } from '../src/core/types.ts';
import { PROTOCOL_TOKENS, TERMINAL_STATE_TOKENS, agentOkToken } from '../src/core/tokens.ts';
import { ROUTING_PROBE_CONTRACT } from '../src/core/roles.ts';
import {
  applyArtifactProposal,
  EXPECTED_ARTIFACT_PATHS,
  generateArtifactProposal,
  isDerivationTarget,
  isGuardrailPath,
  validateArtifactProposal,
  type ArtifactProposal,
  type ArtifactProposalFile,
} from '../src/adapters/opencode/artifacts.ts';

function replaceFile(
  proposal: ArtifactProposal,
  path: string,
  patch: Partial<ArtifactProposalFile>,
): ArtifactProposal {
  return {
    ...proposal,
    files: proposal.files.map((file) => (file.path === path ? { ...file, ...patch } : file)),
  };
}

describe('ADP-05 + MIG-02 + MIG-04 — artefatos OpenCode como proposta', () => {
  it('gera a proposta completa (6 agentes + 2 comandos + opencode.json) sem aplicá-la', () => {
    const proposal = generateArtifactProposal();
    assert.equal(proposal.status, 'proposal');
    assert.equal(proposal.applied, false);
    assert.equal(proposal.files.length, EXPECTED_ARTIFACT_PATHS.length);
    assert.equal(EXPECTED_ARTIFACT_PATHS.length, ROLES.length + 3);
    const paths = proposal.files.map((file) => file.path).sort();
    assert.deepEqual(paths, [...EXPECTED_ARTIFACT_PATHS].sort());
  });

  it('valida a proposta gerada sem problemas', () => {
    const validation = validateArtifactProposal(generateArtifactProposal());
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.problems, []);
  });

  it('cada artefato de agente preserva token AGENT_OK e modo do contrato', () => {
    const proposal = generateArtifactProposal();
    for (const role of ROLES) {
      const file = proposal.files.find((item) => item.path === `.opencode/agents/${role}.md`);
      assert.ok(file !== undefined);
      assert.equal(file.content.includes(agentOkToken(role)), true);
      assert.equal(
        file.content.includes('mode: primary') || file.content.includes('mode: subagent'),
        true,
      );
    }
  });

  it('o comando sprint-loop-check preserva o contrato de sondagem e os tokens (MIG-06)', () => {
    const proposal = generateArtifactProposal();
    const file = proposal.files.find(
      (item) => item.path === '.opencode/commands/sprint-loop-check.md',
    );
    assert.ok(file !== undefined);
    assert.equal(file.content.includes(ROUTING_PROBE_CONTRACT.triggerPrefix), true);
    assert.equal(file.content.includes(PROTOCOL_TOKENS.AGENT_ROUTING_PASS), true);
    assert.equal(file.content.includes(PROTOCOL_TOKENS.INVALID_AGENT_ROUTING), true);
    for (const role of ROLES) {
      if (role !== 'sprint-orchestrator') {
        assert.equal(file.content.includes(agentOkToken(role)), true);
      }
    }
  });

  it('o comando sprint-loop preserva os estados terminais (MIG-06)', () => {
    const proposal = generateArtifactProposal();
    const file = proposal.files.find((item) => item.path === '.opencode/commands/sprint-loop.md');
    assert.ok(file !== undefined);
    for (const terminalState of TERMINAL_STATE_TOKENS) {
      assert.equal(file.content.includes(terminalState), true);
    }
  });

  it('opencode.json proposto é JSON válido e derivado do contrato', () => {
    const proposal = generateArtifactProposal();
    const file = proposal.files.find((item) => item.path === 'opencode.json');
    assert.ok(file !== undefined);
    const parsed: unknown = JSON.parse(file.content);
    assert.equal(typeof parsed === 'object' && parsed !== null, true);
    if (typeof parsed !== 'object' || parsed === null) {
      assert.fail('opencode.json inválido.');
      return;
    }
    const config = parsed as { status?: unknown; guardrails?: unknown };
    assert.equal(config.status, 'PROPOSAL');
    assert.deepEqual(config.guardrails, ['AGENTS.md', 'opencode.json', '.opencode/**']);
  });

  it('token adulterado invalida a proposta (fail-closed)', () => {
    const proposal = generateArtifactProposal();
    const tampered = replaceFile(proposal, '.opencode/agents/sprint-tester.md', {
      content: '---\nid: sprint-tester\n---\n',
    });
    const validation = validateArtifactProposal(tampered);
    assert.equal(validation.ok, false);
    assert.equal(
      validation.problems.some((problem) => problem.includes('AGENT_OK:sprint-tester')),
      true,
    );
  });

  it('caminho com traversal ou fora da derivação invalida a proposta', () => {
    const base = generateArtifactProposal();
    const traversal: ArtifactProposal = {
      ...base,
      files: [...base.files, { path: '../AGENTS.md', content: 'x' }],
    };
    const traversalValidation = validateArtifactProposal(traversal);
    assert.equal(traversalValidation.ok, false);
    assert.equal(
      traversalValidation.problems.some((problem) => problem.includes('traversal')),
      true,
    );

    const foreignTarget: ArtifactProposal = {
      ...base,
      files: [...base.files, { path: 'src/core/loop.ts', content: 'x' }],
    };
    const foreignValidation = validateArtifactProposal(foreignTarget);
    assert.equal(foreignValidation.ok, false);
  });

  it('arquivo ausente ou inesperado invalida a proposta', () => {
    const base = generateArtifactProposal();
    const missing: ArtifactProposal = {
      ...base,
      files: base.files.filter((file) => file.path !== '.opencode/commands/sprint-loop.md'),
    };
    const missingValidation = validateArtifactProposal(missing);
    assert.equal(missingValidation.ok, false);
    assert.equal(
      missingValidation.problems.some((problem) =>
        problem.includes("'.opencode/commands/sprint-loop.md'"),
      ),
      true,
    );

    const extra: ArtifactProposal = {
      ...base,
      files: [...base.files, { path: '.opencode/agents/sprint-extra.md', content: 'x' }],
    };
    const extraValidation = validateArtifactProposal(extra);
    assert.equal(extraValidation.ok, false);
    assert.equal(
      extraValidation.problems.some((problem) => problem.includes('inesperado')),
      true,
    );
  });

  it('classifica caminhos guardrail (AGENTS.md, opencode.json, .opencode/**)', () => {
    assert.equal(isGuardrailPath('AGENTS.md'), true);
    assert.equal(isGuardrailPath('opencode.json'), true);
    assert.equal(isGuardrailPath('.opencode/agents/sprint-implementer.md'), true);
    assert.equal(isGuardrailPath('.opencode/commands/sprint-loop.md'), true);
    assert.equal(isGuardrailPath('docs/sprints/sprint-0/spec.md'), false);
    assert.equal(isGuardrailPath('src/core/loop.ts'), false);
    assert.equal(isGuardrailPath('README.md'), false);
    assert.equal(isDerivationTarget('.opencode/agents/sprint-tester.md'), true);
    assert.equal(isDerivationTarget('opencode.json'), true);
    assert.equal(isDerivationTarget('AGENTS.md'), false);
    assert.equal(isDerivationTarget('src/adapters/opencode/artifacts.ts'), false);
  });

  it('aplicação sobre alvo guardrail gera recusa tipada GUARDRAIL_TARGET_REFUSED (MIG-04)', () => {
    const proposal = generateArtifactProposal();
    for (const target of ['opencode.json', 'AGENTS.md', '.opencode/agents/sprint-implementer.md']) {
      const result = applyArtifactProposal(proposal, target);
      assert.equal(result.applied, false);
      assert.equal(result.refusal.code, 'GUARDRAIL_TARGET_REFUSED');
      assert.equal(result.refusal.token, PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN);
      assert.equal(result.refusal.token, 'BLOCKED_NEEDS_HUMAN');
    }
  });

  it('aplicação fora de guardrail também é recusada: humana, nunca automática', () => {
    const proposal = generateArtifactProposal();
    const result = applyArtifactProposal(proposal, 'docs/sprints/sprint-0/spec.md');
    assert.equal(result.applied, false);
    assert.equal(result.refusal.code, 'HUMAN_APPLIES_ONLY');
    assert.equal(result.refusal.token, PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN);
  });
});
