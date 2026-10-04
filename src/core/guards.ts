// GUARD-01 a GUARD-05 — Guardrails mecanicamente aplicáveis (deny-by-default, fail-closed).
// Allow-list explícita por papel (roles.ts), guardrails protegidos, segredos negados,
// Git somente leitura local e nenhuma infraestrutura externa durante o loop.
// Caminhos são resolvidos (path traversal negado) e comparados em minúsculas (FS
// case-insensitive); toda mensagem de negação passa por redact() antes de ser exposta.
import path from 'node:path';
import { DomainError } from './errors.ts';
import { redact } from './redact.ts';
import { isRole, type Role } from './types.ts';
import { ROLE_CONTRACTS } from './roles.ts';

// GUARD-01 — arquivos guardrail canônicos do framework: mudam somente por edição humana.
// Padrões adicionais (vendor-specific) são passados via extraGuardrailPatterns pelos adapters.
export const GUARDRAIL_PATHS: readonly string[] = ['AGENTS.md'];

// GUARD-03 — padrões de segredo negados por padrão (leitura/edição).
export const SECRET_PATH_PATTERNS: readonly string[] = [
  '.env*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa',
  'id_ed25519',
];

// GUARD-04 — allow-list de operações Git: somente leitura local.
export const ALLOWED_GIT_COMMANDS: readonly string[] = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'git ls-files',
  'git rev-parse',
  'git branch',
];

export const FORBIDDEN_GIT_SUBCOMMANDS: readonly string[] = [
  'push',
  'pull',
  'fetch',
  'clone',
  'remote',
  'commit',
  'merge',
  'rebase',
  'reset',
  'tag',
  'submodule',
];

// GUARD-04 — flags que escrevem arquivos, executam diff externo, comparam fora do índice
// ('--no-index': leitura arbitrária de arquivos locais, SEC-10) ou mutam refs: sempre negadas.
// A comparação cobre a flag exata, valores anexados ('--output=x') e abreviações ('--out').
export const FORBIDDEN_GIT_FLAGS: readonly string[] = [
  '--output',
  '--ext-diff',
  '--textconv',
  '--no-index',
  '--delete',
  '--force',
  '--move',
  '--copy',
  '--edit-description',
  '--set-upstream-to',
  '--unset-upstream',
];

// GUARD-04 — flag curta de escrita: negada em qualquer subcomando ('-o', '-ox', '-o=x')
// e em qualquer posição de cluster ('-po' = '-p -o').
const FORBIDDEN_GIT_WRITE_SHORT_FLAGS: readonly string[] = ['-o'];

// GUARD-04 — flags curtas de mutação de refs: negadas em 'git branch' ('-d', '-D', '-f', ...).
const FORBIDDEN_GIT_REF_SHORT_FLAGS: readonly string[] = [
  '-d',
  '-D',
  '-m',
  '-M',
  '-c',
  '-C',
  '-f',
  '-e',
];

// GUARD-04 — cluster de flags curtas: '-vd' equivale a '-v -d', '-Mm' a '-M -m' e '-po' a
// '-p -o'. A letra proibida vale em QUALQUER posição do cluster, não só logo após o '-':
// '^-[A-Za-z]*[dDmMcCfe]' para as refs e '^-[A-Za-z]*o' para a escrita.
function shortFlagClusterRegExp(flags: readonly string[]): RegExp {
  const letters = flags.map((flag) => flag.slice(1)).join('');
  return new RegExp(`^-[A-Za-z]*[${letters}]`);
}

const FORBIDDEN_GIT_WRITE_SHORT_CLUSTER = shortFlagClusterRegExp(FORBIDDEN_GIT_WRITE_SHORT_FLAGS);
const FORBIDDEN_GIT_REF_SHORT_CLUSTER = shortFlagClusterRegExp(FORBIDDEN_GIT_REF_SHORT_FLAGS);

// 'git branch' somente leitura: positionais (criam/renomeiam refs) só existem junto a filtro.
const BRANCH_FILTER_FLAGS: readonly string[] = [
  '--list',
  '-l',
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
];

// GUARD-04 — caracteres de shell proibidos em qualquer comando Git (documentados e testados).
export const FORBIDDEN_SHELL_METACHARACTERS: readonly string[] = [
  '&&',
  '||',
  ';',
  '|',
  '`',
  '$(',
  '\n',
  '\r',
  '>',
  '<',
];

// GUARD-04 — sanitização de entrada para segurança: negar caracteres de controle hostis
// (\x00–\x1f e DEL). Os literais de controle na regex são uso deliberado e fail-closed.
// eslint-disable-next-line no-control-regex -- sanitização de segurança: negar caracteres de controle hostis
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const SHELL_METACHARACTERS = /[;&|`$><(){}[\]*?~'"\\^%#!]/;
const SAFE_GIT_TOKEN = /^(?:-{1,2})?[A-Za-z0-9][A-Za-z0-9_\-./:=]*$/;

// GUARD-04/SEC-10 — token que parece caminho absoluto ('C:/x', '/etc/passwd', '\\\\host\\share')
// nunca é argumento legítimo do Git somente leitura local: negado em qualquer posição.
const ABSOLUTE_PATH_TOKEN = /^(?:[A-Za-z]:|\/|\\\\)/;

// GUARD-05 — módulos de rede/infraestrutura externa negados durante o loop.
// Formas bare ('https') e 'node:*' ('node:https') são equivalentes; subcaminhos como
// 'dns/promises' são negados pelo nome base. O resto é allow-list implícita (deny-by-default).
const NETWORK_BARE_MODULES: readonly string[] = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dns',
  'dgram',
  'inspector',
];

const NETWORK_THIRD_PARTY_MODULES: readonly string[] = [
  'undici',
  'axios',
  'node-fetch',
  'got',
  'request',
];

export const NETWORK_MODULE_SPECIFIERS: readonly string[] = [
  ...NETWORK_BARE_MODULES.flatMap((name) => [name, `node:${name}`]),
  ...NETWORK_THIRD_PARTY_MODULES,
];

export type GuardDenyCode =
  | 'UNKNOWN_ROLE'
  | 'GUARDRAIL_PROTECTED'
  | 'SECRET_PATH_DENIED'
  | 'ROLE_READ_ONLY'
  | 'PATH_DENIED'
  | 'DENY_BY_DEFAULT'
  | 'GIT_COMMAND_DENIED'
  | 'GIT_REMOTE_FORBIDDEN'
  | 'EXTERNAL_INFRASTRUCTURE_DENIED';

export type GuardDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: GuardDenyCode; readonly reason: string };

export class GuardViolationError extends DomainError {
  public readonly guardCode: string;
  public readonly target: string;

  constructor(guardCode: string, target: string, reason: string) {
    const safeTarget = redact(target);
    const safeReason = redact(reason);
    super(
      'GUARD_VIOLATION',
      `Guardrail ${guardCode} em '${safeTarget}': ${safeReason} (fail-closed).`,
    );
    this.guardCode = guardCode;
    this.target = safeTarget;
  }
}

function deny(code: GuardDenyCode, reason: string): GuardDecision {
  // Nenhuma razão expõe entrada crua: redação é obrigatória na composição (fail-closed).
  return { allowed: false, code, reason: redact(reason) };
}

function allow(): GuardDecision {
  return { allowed: true };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
  if (pattern === '**') {
    return /^.*$/;
  }
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return new RegExp(`^${escapeRegExp(prefix)}(?:/.*)?$`);
  }
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === '*') {
      if (pattern.charAt(index + 1) === '*') {
        if (pattern.charAt(index + 2) === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`);
}

// FS case-insensitive: matching sempre em minúsculas, dos dois lados do padrão.
function matchesPattern(pattern: string, target: string): boolean {
  return globToRegExp(pattern.toLowerCase()).test(target.toLowerCase());
}

type PathResolution =
  | { readonly status: 'RESOLVED'; readonly path: string }
  | { readonly status: 'EMPTY' }
  | { readonly status: 'ABSOLUTE' }
  | { readonly status: 'TRAVERSAL' };

/**
 * Resolve '.', '..' e separadores de segmento em sintaxe POSIX antes de qualquer matching.
 * Caminho absoluto, '..' residual (escape da raiz) e aliases de FS (ponto/espaço final,
 * que em sistemas case-insensitive apontam para o mesmo arquivo) são negados.
 */
function resolveEditPath(target: string): PathResolution {
  const trimmed = typeof target === 'string' ? target.trim() : '';
  const slashed = trimmed.replace(/\\/g, '/');
  const normalized = path.posix.normalize(slashed).replace(/\/+$/, '');
  if (normalized === '' || normalized === '.') {
    return { status: 'EMPTY' };
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return { status: 'ABSOLUTE' };
  }
  const segments = normalized.split('/').map((segment) => segment.replace(/[. ]+$/, ''));
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return { status: 'TRAVERSAL' };
  }
  return { status: 'RESOLVED', path: segments.join('/') };
}

function matchablePath(target: string): string {
  const resolution = resolveEditPath(target);
  return resolution.status === 'RESOLVED' ? resolution.path : target.replace(/\\/g, '/');
}

function basenameOf(target: string): string {
  const parts = target.split('/');
  return parts[parts.length - 1] ?? target;
}

function effectiveGuardrailPatterns(extraGuardrailPatterns?: readonly string[]): readonly string[] {
  if (extraGuardrailPatterns === undefined || extraGuardrailPatterns.length === 0) {
    return GUARDRAIL_PATHS;
  }
  return [...GUARDRAIL_PATHS, ...extraGuardrailPatterns];
}

export function isGuardrailPath(
  target: string,
  extraGuardrailPatterns?: readonly string[],
): boolean {
  const normalized = matchablePath(target);
  return effectiveGuardrailPatterns(extraGuardrailPatterns).some((pattern) =>
    matchesPattern(pattern, normalized),
  );
}

export function isSecretPath(target: string): boolean {
  const normalized = matchablePath(target);
  const basename = basenameOf(normalized);
  return SECRET_PATH_PATTERNS.some((pattern) => {
    return matchesPattern(pattern, normalized) || matchesPattern(pattern, basename);
  });
}

/**
 * Deny-by-default por papel: guardrail e segredo negados para todos; papel somente leitura
 * negado; fora da allow-list explícita do contrato, a negação é o padrão. O caminho é
 * resolvido antes de qualquer matching — nunca sobre a entrada crua.
 */
export function checkEdit(
  role: unknown,
  targetPath: string,
  extraGuardrailPatterns?: readonly string[],
): GuardDecision {
  if (!isRole(role)) {
    return deny('UNKNOWN_ROLE', `papel desconhecido: '${redact(String(role))}' (fail-closed)`);
  }
  const resolution = resolveEditPath(targetPath);
  if (resolution.status === 'EMPTY') {
    return deny('DENY_BY_DEFAULT', 'caminho vazio (fail-closed)');
  }
  if (resolution.status === 'ABSOLUTE') {
    return deny(
      'PATH_DENIED',
      'caminho absoluto negado: use caminho relativo à raiz do repositório (fail-closed)',
    );
  }
  if (resolution.status === 'TRAVERSAL') {
    return deny(
      'PATH_DENIED',
      "path traversal negado: '..' residual ou alias de FS após resolução (fail-closed)",
    );
  }
  const normalized = resolution.path;
  if (isGuardrailPath(normalized, extraGuardrailPatterns)) {
    return deny(
      'GUARDRAIL_PROTECTED',
      `'${redact(normalized)}' é guardrail e muda somente por edição humana`,
    );
  }
  if (isSecretPath(normalized)) {
    return deny('SECRET_PATH_DENIED', `'${redact(normalized)}' segue padrão de segredo negado`);
  }
  const contract = ROLE_CONTRACTS[role];
  if (contract.readOnly) {
    return deny('ROLE_READ_ONLY', `papel '${role}' é somente leitura`);
  }
  if (contract.editScope.deny.some((pattern) => matchesPattern(pattern, normalized))) {
    return deny('PATH_DENIED', `'${redact(normalized)}' está na deny-list do papel '${role}'`);
  }
  if (contract.editScope.allow.some((pattern) => matchesPattern(pattern, normalized))) {
    return allow();
  }
  return deny(
    'DENY_BY_DEFAULT',
    `'${redact(normalized)}' fora da allow-list do papel '${role}' (deny-by-default)`,
  );
}

export function assertCanEdit(
  role: Role,
  targetPath: string,
  extraGuardrailPatterns?: readonly string[],
): void {
  const decision = checkEdit(role, targetPath, extraGuardrailPatterns);
  if (!decision.allowed) {
    const resolution = resolveEditPath(targetPath);
    const display = resolution.status === 'RESOLVED' ? resolution.path : targetPath;
    throw new GuardViolationError(decision.code, display, decision.reason);
  }
}

function isSafeGitToken(token: string): boolean {
  return token === '--' || SAFE_GIT_TOKEN.test(token);
}

// Cobre flag exata, valores anexados ('--output=x') e abreviações não ambíguas ('--out=x').
function matchesFlagVariant(token: string, flag: string): boolean {
  const name = token.split('=')[0] ?? token;
  if (name === flag || name.startsWith(flag)) {
    return true;
  }
  return flag.startsWith(name) && name.length >= 3 && name !== '--';
}

function isForbiddenGitFlag(token: string): boolean {
  if (FORBIDDEN_GIT_FLAGS.some((flag) => matchesFlagVariant(token, flag))) {
    return true;
  }
  // Cluster de flags curtas ('-po' = '-p -o'): qualquer letra proibida em qualquer posição
  // do cluster nega o token; flags longas ('--...') nunca casam o cluster.
  return FORBIDDEN_GIT_WRITE_SHORT_CLUSTER.test(token);
}

function isForbiddenGitRefShortFlag(token: string): boolean {
  // Cluster de flags curtas ('-vd' = '-v -d'): qualquer letra proibida em qualquer posição
  // do cluster nega o token; flags longas ('--...') nunca casam o cluster.
  return FORBIDDEN_GIT_REF_SHORT_CLUSTER.test(token);
}

// GUARD-04/SEC-10 — candidatos a caminho de um token Git: o token inteiro, o valor anexado
// por '=' ('--opt=caminho') e o caminho após 'rev:' ('HEAD:arquivo' — tudo após o primeiro ':').
function gitPathCandidates(token: string): readonly string[] {
  const candidates = [token];
  const eq = token.indexOf('=');
  if (eq >= 0 && eq < token.length - 1) {
    candidates.push(token.slice(eq + 1));
  }
  const colon = token.indexOf(':');
  if (colon >= 0 && colon < token.length - 1) {
    candidates.push(token.slice(colon + 1));
  }
  return candidates;
}

// GUARD-04/SEC-10 — caminho absoluto ('C:/x', '/etc/passwd', '\\\\host\\share') em qualquer
// candidato é negado: permitiria leitura arbitrária de arquivos locais fora do repositório.
function isAbsoluteGitPathArg(token: string): boolean {
  return gitPathCandidates(token).some((candidate) => ABSOLUTE_PATH_TOKEN.test(candidate));
}

// GUARD-03/SEC-10 — argumentos posicionais do Git passam por isSecretPath: 'git diff -- id_rsa'
// ou 'git show HEAD:.env' tentam ler segredos e são negados (fail-closed). Flags são ignoradas
// (podem carregar padrões de busca, ex. '--grep=.env', sem ler arquivos) — exceto após '--',
// onde token iniciado por '-' é pathspec literal ('git diff -- -x.key') e é verificado.
function isSecretGitArg(token: string, literalPathspec: boolean): boolean {
  if (token.startsWith('-') && !literalPathspec) {
    return false;
  }
  return gitPathCandidates(token).some((candidate) => isSecretPath(candidate));
}

// GUARD-04/SEC-10 — argumento posicional de caminho passa pela resolução de path (também após
// 'rev:', 'HEAD:arquivo'): traversal residual negado. O status EMPTY ('.', raiz do repositório)
// é pathspec legítimo do Git e permanece aceito; flag não é argumento de caminho — exceto após
// '--', onde token iniciado por '-' é pathspec literal e é verificado.
function isInvalidGitPathArg(token: string, literalPathspec: boolean): boolean {
  if (token.startsWith('-') && !literalPathspec) {
    return false;
  }
  return gitPathCandidates(token).some((candidate) => {
    const status = resolveEditPath(candidate).status;
    return status === 'TRAVERSAL' || status === 'ABSOLUTE';
  });
}

// 'git branch' é listagem: positionais (nomes de ref) só valem junto a flag de filtro.
function checkGitBranchArgs(args: readonly string[]): GuardDecision | null {
  const hasFilterFlag = args.some((arg) =>
    BRANCH_FILTER_FLAGS.some((flag) => matchesFlagVariant(arg, flag)),
  );
  for (const arg of args) {
    if (isForbiddenGitRefShortFlag(arg)) {
      return deny(
        'GIT_COMMAND_DENIED',
        'git branch é somente leitura: flag de mutação de ref negada (fail-closed)',
      );
    }
    if (!arg.startsWith('-') && !hasFilterFlag) {
      return deny(
        'GIT_COMMAND_DENIED',
        'git branch é somente leitura: argumento posicional negado (fail-closed)',
      );
    }
  }
  return null;
}

// GUARD-04 — somente comandos Git da allow-list somente leitura; remota/mutável é proibida.
// Validação token a token: sem metacaracteres de shell, charset seguro, sem flags perigosas,
// sem caminhos absolutos e sem argumentos que casem padrão de segredo (SEC-10).
export function checkGitCommand(command: string): GuardDecision {
  const raw = typeof command === 'string' ? command : '';
  if (raw.trim() === '') {
    return deny('GIT_COMMAND_DENIED', 'comando vazio (fail-closed)');
  }
  if (CONTROL_CHARS.test(raw)) {
    return deny('GIT_COMMAND_DENIED', 'comando contém caractere de controle (fail-closed)');
  }
  const tokens = raw.trim().replace(/ {2,}/g, ' ').split(' ');
  const program = tokens[0]?.toLowerCase() ?? '';
  const subcommand = tokens[1]?.toLowerCase() ?? '';
  if (program !== 'git') {
    return deny('GIT_COMMAND_DENIED', `fora da allow-list de operações Git: '${redact(raw)}'`);
  }
  if (subcommand === '') {
    return deny('GIT_COMMAND_DENIED', 'comando git sem subcomando (fail-closed)');
  }
  if (FORBIDDEN_GIT_SUBCOMMANDS.includes(subcommand)) {
    return deny('GIT_REMOTE_FORBIDDEN', `operação Git remota/mutável proibida: git ${subcommand}`);
  }
  // Após '--' no comando Git, todo token é pathspec literal: '-' inicial não é flag e
  // passa por isSecretGitArg/isInvalidGitPathArg como qualquer argumento de caminho.
  let literalPathspec = false;
  for (const token of tokens) {
    if (SHELL_METACHARACTERS.test(token)) {
      return deny('GIT_COMMAND_DENIED', 'comando contém metacaractere de shell (fail-closed)');
    }
    if (isAbsoluteGitPathArg(token)) {
      return deny(
        'GIT_COMMAND_DENIED',
        'argumento de caminho absoluto negado em comando Git (fail-closed)',
      );
    }
    if (isSecretGitArg(token, literalPathspec)) {
      return deny(
        'SECRET_PATH_DENIED',
        'argumento de comando Git casa padrão de segredo negado (fail-closed)',
      );
    }
    if (!isSafeGitToken(token)) {
      return deny(
        'GIT_COMMAND_DENIED',
        'comando contém token fora do charset seguro (fail-closed)',
      );
    }
    if (isForbiddenGitFlag(token)) {
      return deny('GIT_COMMAND_DENIED', `flag Git perigosa negada: '${redact(token)}'`);
    }
    if (isInvalidGitPathArg(token, literalPathspec)) {
      return deny(
        'GIT_COMMAND_DENIED',
        'argumento de caminho Git inválido: path traversal negado (fail-closed)',
      );
    }
    if (token === '--') {
      literalPathspec = true;
    }
  }
  if (subcommand === 'branch') {
    const branchDecision = checkGitBranchArgs(tokens.slice(2));
    if (branchDecision !== null) {
      return branchDecision;
    }
  }
  if (!ALLOWED_GIT_COMMANDS.includes(`git ${subcommand}`)) {
    return deny('GIT_COMMAND_DENIED', `git ${subcommand} fora da allow-list somente leitura`);
  }
  return allow();
}

export function isAllowedGitCommand(command: string): boolean {
  return checkGitCommand(command).allowed;
}

export function isNetworkSpecifier(specifier: string): boolean {
  const normalized = typeof specifier === 'string' ? specifier.trim().toLowerCase() : '';
  if (normalized === '') {
    return false;
  }
  // 'https', 'node:https' e 'node:https/x' convergem para o nome base 'https'.
  const base = normalized.startsWith('node:') ? normalized.slice('node:'.length) : normalized;
  const head = (base.split('/')[0] ?? base).replace(/:+$/, '');
  return NETWORK_MODULE_SPECIFIERS.includes(head);
}

const EXTERNAL_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const NETWORK_GLOBAL_PATTERN = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/;

// GUARD-05 — nenhuma infraestrutura externa durante o loop de Sprint.
export function checkExternalInfrastructure(reference: string): GuardDecision {
  const normalized = typeof reference === 'string' ? reference.trim() : '';
  if (normalized === '') {
    return deny('EXTERNAL_INFRASTRUCTURE_DENIED', 'referência vazia (fail-closed)');
  }
  if (isNetworkSpecifier(normalized)) {
    return deny('EXTERNAL_INFRASTRUCTURE_DENIED', `módulo de rede negado: '${redact(normalized)}'`);
  }
  if (EXTERNAL_URL_PATTERN.test(normalized)) {
    return deny(
      'EXTERNAL_INFRASTRUCTURE_DENIED',
      `URL de infraestrutura externa negada: '${redact(normalized)}'`,
    );
  }
  if (NETWORK_GLOBAL_PATTERN.test(normalized)) {
    return deny('EXTERNAL_INFRASTRUCTURE_DENIED', `API de rede negada em '${redact(normalized)}'`);
  }
  return allow();
}

export function assertNoNetworkImports(specifiers: Iterable<string>): void {
  for (const specifier of specifiers) {
    if (isNetworkSpecifier(specifier)) {
      throw new GuardViolationError(
        'EXTERNAL_INFRASTRUCTURE_DENIED',
        specifier,
        'import de módulo de rede detectado',
      );
    }
  }
}
