// ADP-05 + MIG-02 + MIG-04 — Derivação/validação dos artefatos `.opencode/**` e `opencode.json`
// a partir do contrato canônico, sempre como PROPOSTA ao humano (sem aplicação automática).
// Alvo guardrail -> recusa tipada; o humano aplica.
import { ROLES, type Role } from '../../core/types.ts';
import { PROTOCOL_TOKENS, TERMINAL_STATE_TOKENS, agentOkToken } from '../../core/tokens.ts';
import {
  EXACT_DELEGATION,
  ROLE_CONTRACTS,
  ROUTING_PROBE_CONTRACT,
  type RoleContract,
} from '../../core/roles.ts';
import { OPENCODE_ROLE_MAPPINGS, type OpenCodeRoleMapping } from './role-mapping.ts';
import { buildProbePlan, EXPECTED_PROBE_COUNT } from './routing.ts';
import { REQUIRED_WORKFLOW_COMMANDS } from './parity.ts';
import { OPENCODE_GUARDRAIL_PATTERNS } from './policies.ts';

/** Arquivos guardrail sob autoria humana (GUARD-01 + política OpenCode). */
export const GUARDRAIL_PATHS: readonly string[] = Object.freeze([
  'AGENTS.md',
  ...OPENCODE_GUARDRAIL_PATTERNS,
]);

/** Identidade de um arquivo proposto (caminho relativo, separador `/`). */
export interface ArtifactProposalFile {
  readonly path: string;
  readonly content: string;
}

/** Proposta de artefatos: gerada e validada, nunca aplicada automaticamente. */
export interface ArtifactProposal {
  readonly status: 'proposal';
  readonly applied: false;
  readonly files: readonly ArtifactProposalFile[];
}

/** Resultado estruturado da validação de uma proposta (fail-closed). */
export interface ProposalValidationResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** Códigos de recusa tipada de aplicação de proposta. */
export type ArtifactRefusalCode = 'GUARDRAIL_TARGET_REFUSED' | 'HUMAN_APPLIES_ONLY';

/** Recusa tipada de aplicação: nenhum artefato é aplicado pelo adapter. */
export interface ArtifactRefusal {
  readonly code: ArtifactRefusalCode;
  readonly token: typeof PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN;
  readonly target: string;
  readonly message: string;
}

/** Resultado de tentativa de aplicação: sempre recusado (`applied` é sempre `false`). */
export interface ArtifactApplyResult {
  readonly applied: false;
  readonly refusal: ArtifactRefusal;
}

/** Caminhos esperados na proposta completa (6 agentes + 2 comandos + `opencode.json`). */
export const EXPECTED_ARTIFACT_PATHS: readonly string[] = Object.freeze([
  ...ROLES.map((role) => `.opencode/agents/${role}.md`),
  '.opencode/commands/sprint-loop-check.md',
  '.opencode/commands/sprint-loop.md',
  'opencode.json',
]);

function normalizeArtifactPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasPathTraversal(path: string): boolean {
  return normalizeArtifactPath(path).split('/').includes('..');
}

function isAbsoluteArtifactPath(path: string): boolean {
  const normalized = normalizeArtifactPath(path);
  return normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized);
}

/** Indica se o caminho é guardrail (autoria humana): `AGENTS.md`, `opencode.json`, `.opencode/**`. */
export function isGuardrailPath(path: string): boolean {
  const normalized = normalizeArtifactPath(path);
  if (normalized === 'AGENTS.md' || normalized === 'opencode.json') {
    return true;
  }
  return normalized.startsWith('.opencode/');
}

/** Indica se o caminho é alvo legítimo de derivação pelo adapter (`.opencode/**` ou `opencode.json`). */
export function isDerivationTarget(path: string): boolean {
  const normalized = normalizeArtifactPath(path);
  return normalized === 'opencode.json' || normalized.startsWith('.opencode/');
}

function buildAgentArtifactContent(mapping: OpenCodeRoleMapping): string {
  const contract: RoleContract | undefined = ROLE_CONTRACTS[mapping.role];
  if (contract === undefined) {
    throw new Error(`Contrato canônico ausente para '${mapping.role}' (fail-closed).`);
  }
  const responsibilities = contract.responsibilities.map((item) => `- ${item}`).join('\n');
  return [
    '---',
    `id: ${mapping.agent}`,
    `canonicalName: ${mapping.canonicalName}`,
    `mode: ${mapping.mode}`,
    `readOnly: ${String(mapping.readOnly)}`,
    `token: ${mapping.token}`,
    `editAllow: ${JSON.stringify(mapping.editScope.allow)}`,
    `editDeny: ${JSON.stringify(mapping.editScope.deny)}`,
    `editDenyByDefault: ${String(mapping.editScope.denyByDefault)}`,
    `bashAllow: ${JSON.stringify(mapping.permissions.bash.allow)}`,
    `bashDeny: ${JSON.stringify(mapping.permissions.bash.deny)}`,
    `bashDenyByDefault: ${String(mapping.permissions.bash.denyByDefault)}`,
    `taskAllow: ${JSON.stringify(mapping.permissions.task.allow)}`,
    `taskDeny: ${JSON.stringify(mapping.permissions.task.deny)}`,
    `taskDenyByDefault: ${String(mapping.permissions.task.denyByDefault)}`,
    '---',
    '',
    `# ${mapping.canonicalName}`,
    '',
    `Agente OpenCode derivado do contrato canônico (token preservado: ${mapping.token}).`,
    '',
    'Responsabilidades:',
    responsibilities,
    '',
    `Delegação (task): ${mapping.permissions.task.allow.length > 0 ? `lista fechada de ${EXPECTED_PROBE_COUNT} subagentes` : 'negada'}.`,
    `Escrita: ${mapping.readOnly ? 'negada estruturalmente (somente leitura)' : 'conforme escopo de edição'}.`,
    '',
  ].join('\n');
}

function buildLoopCheckContent(): string {
  const planLines = buildProbePlan().map(
    (expectation) => `${expectation.index + 1}. ${expectation.agent} -> ${expectation.token}`,
  );
  return [
    '---',
    'id: sprint-loop-check',
    '---',
    '',
    '# /sprint-loop-check',
    '',
    'Validação de roteamento vendor-neutral do loop de Sprint.',
    '',
    `- Gatilho de sondagem: ${ROUTING_PROBE_CONTRACT.triggerPrefix}`,
    `- Ferramentas permitidas na sondagem: ${ROUTING_PROBE_CONTRACT.allowedToolCount} (zero ferramentas)`,
    '- Resposta exigida: somente AGENT_OK:<agente>, sem explicação ou texto adicional.',
    `- Fallback/substituto proibido (${FORBIDDEN_FALLBACK_TEXT}).`,
    '',
    `Sondagens na ordem exata de delegação (${EXPECTED_PROBE_COUNT} no total):`,
    ...planLines,
    '',
    `Resultado final esperado: ${PROTOCOL_TOKENS.AGENT_ROUTING_PASS}`,
    `Fail-closed: ${PROTOCOL_TOKENS.INVALID_AGENT_ROUTING} (substituto, fallback, ferramenta ou token divergente), ` +
      `${PROTOCOL_TOKENS.AGENT_ROUTING_REQUIRED} (sondagens ausentes), ` +
      `${PROTOCOL_TOKENS.INVALID_ORCHESTRATOR_CONTEXT} (contexto inválido).`,
    '',
  ].join('\n');
}

function buildLoopContent(): string {
  return [
    '---',
    'id: sprint-loop',
    '---',
    '',
    '# /sprint-loop',
    '',
    'Loop de Sprint com estados validados, journal e quality gates (fonte: AGENTS.md).',
    '',
    'Fases: PREFLIGHT -> PLANNING -> IMPLEMENTING -> TESTING -> GATE_RUN -> REVIEWING -> REMEDIATING -> (próximo ciclo | estado terminal)',
    '',
    `Estados terminais preservados: ${TERMINAL_STATE_TOKENS.join(', ')}.`,
    `${PROTOCOL_TOKENS.READY_FOR_HUMAN_REVIEW} é o único estado de sucesso técnico.`,
    `${PROTOCOL_TOKENS.NO_TEST_RUNNER_DECLARED} nunca equivale a PASS -> ${PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN}.`,
    'Escritor único por working tree; reviewers sempre somente leitura.',
    'Aplicação de artefatos sobre guardrails: somente humana (geração é proposta).',
    '',
  ].join('\n');
}

function buildOpenCodeConfig(): string {
  const agents: Record<string, unknown> = {};
  for (const mapping of OPENCODE_ROLE_MAPPINGS) {
    agents[mapping.agent] = {
      canonicalName: mapping.canonicalName,
      mode: mapping.mode,
      readOnly: mapping.readOnly,
      token: mapping.token,
      editScope: mapping.editScope,
      permissions: mapping.permissions,
    };
  }
  const config = {
    status: 'PROPOSAL',
    derivedFrom: 'VianaHub.Global.Agentic contract (Sprint 0)',
    agents,
    delegationOrder: [...EXACT_DELEGATION],
    protocolTokens: { ...PROTOCOL_TOKENS },
    terminalStates: [...TERMINAL_STATE_TOKENS],
    workflowCommands: [...REQUIRED_WORKFLOW_COMMANDS],
    guardrails: [...GUARDRAIL_PATHS],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

const FORBIDDEN_FALLBACK_TEXT = 'general, build, explore, scout';

/**
 * Gera a proposta completa de artefatos a partir do contrato canônico:
 * `.opencode/agents/*.md`, `.opencode/commands/*.md` e `opencode.json`.
 * A proposta nunca é aplicada automaticamente (MIG-04).
 */
export function generateArtifactProposal(): ArtifactProposal {
  const files: ArtifactProposalFile[] = [];
  for (const mapping of OPENCODE_ROLE_MAPPINGS) {
    files.push({
      path: `.opencode/agents/${mapping.agent}.md`,
      content: buildAgentArtifactContent(mapping),
    });
  }
  files.push({ path: '.opencode/commands/sprint-loop-check.md', content: buildLoopCheckContent() });
  files.push({ path: '.opencode/commands/sprint-loop.md', content: buildLoopContent() });
  files.push({ path: 'opencode.json', content: buildOpenCodeConfig() });
  return Object.freeze({
    status: 'proposal',
    applied: false,
    files: Object.freeze(files),
  });
}

/**
 * Valida uma proposta de artefatos de forma fail-closed: caminhos sem traversal,
 * alvos de derivação permitidos, conjunto completo de arquivos, tokens byte a byte,
 * contrato de sondagem preservado e `opencode.json` parseável.
 */
export function validateArtifactProposal(proposal: ArtifactProposal): ProposalValidationResult {
  const problems: string[] = [];

  if (proposal.status !== 'proposal' || proposal.applied !== false) {
    problems.push('Proposta inválida: somente status "proposal" com applied=false é aceito.');
  }

  const fileByPath = new Map<string, ArtifactProposalFile>();
  for (const file of proposal.files) {
    const normalized = normalizeArtifactPath(file.path);
    if (hasPathTraversal(file.path) || isAbsoluteArtifactPath(file.path)) {
      problems.push(`Caminho com traversal ou absoluto é proibido: '${file.path}'.`);
      continue;
    }
    if (!isDerivationTarget(normalized)) {
      problems.push(`Alvo fora da derivação permitida: '${file.path}'.`);
      continue;
    }
    if (fileByPath.has(normalized)) {
      problems.push(`Caminho duplicado na proposta: '${normalized}'.`);
      continue;
    }
    fileByPath.set(normalized, file);
  }

  if (fileByPath.size !== proposal.files.length && problems.length === 0) {
    problems.push('Proposta contém caminhos inválidos ou duplicados.');
  }

  const expectedPaths = new Set(EXPECTED_ARTIFACT_PATHS);
  for (const expectedPath of expectedPaths) {
    if (!fileByPath.has(expectedPath)) {
      problems.push(`Arquivo ausente na proposta: '${expectedPath}'.`);
    }
  }
  for (const path of fileByPath.keys()) {
    if (!expectedPaths.has(path)) {
      problems.push(`Arquivo inesperado na proposta: '${path}'.`);
    }
  }

  for (const role of ROLES) {
    const file = fileByPath.get(`.opencode/agents/${role}.md`);
    const mapping = OPENCODE_ROLE_MAPPINGS.find((item) => item.role === role);
    if (file === undefined || mapping === undefined) {
      continue;
    }
    if (!file.content.includes(mapping.token)) {
      problems.push(`Token '${mapping.token}' ausente em '${file.path}'.`);
    }
    if (!file.content.includes(`mode: ${mapping.mode}`)) {
      problems.push(`Modo '${mapping.mode}' ausente em '${file.path}'.`);
    }
    const expectedToken = agentOkToken(role as Role);
    if (mapping.token !== expectedToken) {
      problems.push(`Token não preservado para '${role}'.`);
    }
  }

  const loopCheck = fileByPath.get('.opencode/commands/sprint-loop-check.md');
  if (loopCheck !== undefined) {
    if (!loopCheck.content.includes(ROUTING_PROBE_CONTRACT.triggerPrefix)) {
      problems.push(
        `Gatilho '${ROUTING_PROBE_CONTRACT.triggerPrefix}' ausente em '${loopCheck.path}'.`,
      );
    }
    if (!loopCheck.content.includes(PROTOCOL_TOKENS.AGENT_ROUTING_PASS)) {
      problems.push(
        `Token '${PROTOCOL_TOKENS.AGENT_ROUTING_PASS}' ausente em '${loopCheck.path}'.`,
      );
    }
    for (const expectation of buildProbePlan()) {
      if (!loopCheck.content.includes(expectation.token)) {
        problems.push(`Token '${expectation.token}' ausente em '${loopCheck.path}'.`);
      }
    }
  }

  const loop = fileByPath.get('.opencode/commands/sprint-loop.md');
  if (loop !== undefined) {
    for (const terminalState of TERMINAL_STATE_TOKENS) {
      if (!loop.content.includes(terminalState)) {
        problems.push(`Estado terminal '${terminalState}' ausente em '${loop.path}'.`);
      }
    }
  }

  const config = fileByPath.get('opencode.json');
  if (config !== undefined) {
    try {
      JSON.parse(config.content);
    } catch {
      problems.push("'opencode.json' da proposta não é JSON válido.");
    }
  }

  return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
}

/**
 * Fronteira de aplicação (MIG-04): o adapter nunca aplica a proposta. Alvo guardrail
 * recebe recusa tipada `GUARDRAIL_TARGET_REFUSED`; qualquer outro alvo recebe
 * `HUMAN_APPLIES_ONLY`. `applied` é sempre `false`.
 */
export function applyArtifactProposal(
  proposal: ArtifactProposal,
  targetPath: string,
): ArtifactApplyResult {
  void proposal;
  const normalized = normalizeArtifactPath(targetPath);
  const guardrail = isGuardrailPath(normalized);
  const code: ArtifactRefusalCode = guardrail ? 'GUARDRAIL_TARGET_REFUSED' : 'HUMAN_APPLIES_ONLY';
  const message = guardrail
    ? `Recusa tipada: '${normalized}' é guardrail sob autoria humana; ` +
      'a aplicação depende de aprovação humana explícita.'
    : `Recusa tipada: '${normalized}' não é alvo de aplicação automática; ` +
      'a aplicação é sempre humana.';
  return Object.freeze({
    applied: false,
    refusal: Object.freeze({
      code,
      token: PROTOCOL_TOKENS.BLOCKED_NEEDS_HUMAN,
      target: normalized,
      message,
    }),
  });
}
