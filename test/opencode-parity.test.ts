// ADP-08 + MIG-03 + MIG-06 — Testes de paridade semente × derivados (tokens, ordem de
// delegação, permissões, estados terminais) e da não-regressão do workflow.
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES } from '../src/core/types.ts';
import { EXACT_DELEGATION, READ_ONLY_ROLES, ROLE_CONTRACTS } from '../src/core/roles.ts';
import { agentOkToken, PROTOCOL_TOKENS, TERMINAL_STATE_TOKENS } from '../src/core/tokens.ts';
import {
  buildContractSnapshot,
  PARITY_ABSENT,
  REQUIRED_WORKFLOW_COMMANDS,
  verifyParity,
  type ParitySnapshot,
} from '../src/adapters/opencode/parity.ts';

const SEED_AGENTS_DIR = resolve(import.meta.dirname, '..', '.opencode', 'agents');

function readSeedAgent(role: string): string {
  return readFileSync(join(SEED_AGENTS_DIR, `${role}.md`), 'utf-8');
}

/**
 * RV-F01 — Fotografia dos artefatos de semente reais (`*.opencode/agents/*.md`).
 * Versão mínima: lê os 6 arquivos, extrai/verifica os tokens `AGENT_OK:<agente>`
 * e replica as demais dimensões do contrato para o confronto via `verifyParity`.
 */
function buildSeedSnapshot(): ParitySnapshot {
  const contract = buildContractSnapshot();
  const tokens: Record<string, string> = { ...contract.tokens };

  for (const role of EXACT_DELEGATION) {
    const content = readSeedAgent(role);
    const token = agentOkToken(role);
    assert.ok(
      content.includes(token),
      `Token ${token} ausente no artefato de semente .opencode/agents/${role}.md`,
    );
    tokens[token] = token;
  }

  return {
    ...contract,
    tokens,
  };
}

describe('ADP-08 + MIG-03 + MIG-06 — paridade semente × derivados', () => {
  it('paridade plena entre semente e derivado idêntico (zero divergências)', () => {
    const snapshot = buildContractSnapshot();
    const report = verifyParity(snapshot, snapshot);
    assert.equal(report.ok, true);
    assert.deepEqual(report.diffs, []);
  });

  it('RV-F01 — paridade entre contrato canônico e artefatos de semente reais', () => {
    const expected = buildContractSnapshot();
    const actual = buildSeedSnapshot();
    const report = verifyParity(expected, actual);
    assert.equal(report.ok, true, `Divergências: ${JSON.stringify(report.diffs)}`);
    assert.deepEqual(report.diffs, []);
  });

  it('a fotografia de referência preserva os dez tokens de protocolo e os tokens AGENT_OK', () => {
    const snapshot = buildContractSnapshot();
    for (const token of Object.values(PROTOCOL_TOKENS)) {
      assert.equal(snapshot.tokens[token], token);
    }
    assert.equal(snapshot.tokens['AGENT_OK:<agente>'], PROTOCOL_TOKENS['AGENT_OK:<agente>']);
    for (const role of EXACT_DELEGATION) {
      assert.equal(snapshot.tokens[`AGENT_OK:${role}`], agentOkToken(role));
    }
    assert.deepEqual(snapshot.delegationOrder, [...EXACT_DELEGATION]);
    assert.deepEqual(snapshot.terminalStates, [...TERMINAL_STATE_TOKENS]);
    assert.deepEqual(snapshot.workflowCommands, [...REQUIRED_WORKFLOW_COMMANDS]);
    assert.deepEqual(snapshot.workflowCommands, ['sprint-loop-check', 'sprint-loop']);
  });

  it('preserva permissões e somente-leitura por papel na fotografia', () => {
    const snapshot = buildContractSnapshot();
    for (const role of ROLES) {
      const permissions = snapshot.permissions[role];
      assert.ok(permissions !== undefined);
      assert.equal(permissions.mode, ROLE_CONTRACTS[role].mode);
      assert.equal(permissions.readOnly, ROLE_CONTRACTS[role].readOnly);
    }
    for (const readOnlyRole of READ_ONLY_ROLES) {
      const permissions = snapshot.permissions[readOnlyRole];
      assert.ok(permissions !== undefined);
      assert.equal(permissions.readOnly, true);
    }
  });

  it('divergência de token é reportada na dimensão tokens (MIG-03)', () => {
    const base = buildContractSnapshot();
    const derived: ParitySnapshot = {
      ...base,
      tokens: { ...base.tokens, 'AGENT_OK:sprint-tester': 'AGENT_OK:substituto' },
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    const diff = report.diffs.find((item) => item.dimension === 'tokens');
    assert.ok(diff !== undefined);
    assert.equal(diff.key, 'AGENT_OK:sprint-tester');
    assert.equal(diff.expected, 'AGENT_OK:sprint-tester');
    assert.equal(diff.actual, 'AGENT_OK:substituto');
  });

  it('divergência de ordem de delegação é reportada', () => {
    const base = buildContractSnapshot();
    const derived: ParitySnapshot = {
      ...base,
      delegationOrder: [...base.delegationOrder].reverse(),
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    assert.equal(
      report.diffs.every((diff) => diff.dimension === 'delegationOrder'),
      true,
    );
    assert.equal(
      report.diffs.some((diff) => diff.key === 'delegationOrder[0]'),
      true,
    );
  });

  it('divergência de permissões é reportada por papel e campo', () => {
    const base = buildContractSnapshot();
    const reviewer = base.permissions['sprint-reviewer'];
    assert.ok(reviewer !== undefined);
    const derived: ParitySnapshot = {
      ...base,
      permissions: {
        ...base.permissions,
        'sprint-reviewer': { ...reviewer, taskAllow: ['**'] },
      },
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    const diff = report.diffs.find((item) => item.key === 'permissions.sprint-reviewer.taskAllow');
    assert.ok(diff !== undefined);
    assert.equal(diff.dimension, 'permissions');
    assert.equal(diff.expected, '[]');
    assert.equal(diff.actual, '["**"]');
  });

  it('estado terminal ausente no derivado é reportado (sem skip silencioso)', () => {
    const base = buildContractSnapshot();
    const derived: ParitySnapshot = {
      ...base,
      terminalStates: base.terminalStates.filter((state) => state !== 'FAILED_QUALITY_GATES'),
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    const diff = report.diffs.find((item) => item.key === 'terminalStates:FAILED_QUALITY_GATES');
    assert.ok(diff !== undefined);
    assert.equal(diff.dimension, 'terminalStates');
    assert.equal(diff.expected, 'presente');
    assert.equal(diff.actual, PARITY_ABSENT);
  });

  it('regressão de workflow (sprint-loop ausente) é reportada (MIG-06)', () => {
    const base = buildContractSnapshot();
    const derived: ParitySnapshot = {
      ...base,
      workflowCommands: ['sprint-loop-check'],
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    const diff = report.diffs.find((item) => item.key === 'workflowCommands:sprint-loop');
    assert.ok(diff !== undefined);
    assert.equal(diff.dimension, 'workflowCommands');
    assert.equal(diff.expected, 'presente');
    assert.equal(diff.actual, PARITY_ABSENT);
  });

  it('é fail-closed: qualquer conjunto de divergências mantém ok=false', () => {
    const base = buildContractSnapshot();
    const derived: ParitySnapshot = {
      tokens: { 'AGENT_OK:sprint-implementer': 'AGENT_OK:sprint-implementer' },
      delegationOrder: [],
      permissions: {},
      terminalStates: [],
      workflowCommands: [],
    };
    const report = verifyParity(base, derived);
    assert.equal(report.ok, false);
    const dimensions = new Set(report.diffs.map((diff) => diff.dimension));
    assert.equal(dimensions.has('tokens'), true);
    assert.equal(dimensions.has('delegationOrder'), true);
    assert.equal(dimensions.has('permissions'), true);
    assert.equal(dimensions.has('terminalStates'), true);
    assert.equal(dimensions.has('workflowCommands'), true);
    assert.equal(report.diffs.length > 0, true);
  });
});
