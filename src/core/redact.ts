// LOOP-08, GUARD-03 — Redação de segredos antes de qualquer persistência (fail-closed).
// Todo padrão sensível encontrado é substituído por [REDACTED]; texto sem padrão passa intacto.
import { DomainError } from './errors.ts';

export const REDACTION_PLACEHOLDER = '[REDACTED]';

type RedactionMode = 'replace-all' | 'replace-value' | 'replace-credentials';

interface SecretPattern {
  readonly name: string;
  readonly mode: RedactionMode;
  readonly regex: RegExp;
}

// Vocabulário único de nomes sensíveis (chaves de API, tokens, senhas e credenciais),
// compartilhado pelo padrão de atribuição e pela inspeção de nomes de chave em
// contêineres: sempre o mesmo vocabulário, sem duplicação.
const SENSITIVE_KEY_SOURCE =
  '[A-Za-z0-9_.-]*(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|passphrase|' +
  'credential[s]?|private[_-]?key|client[_-]?secret|access[_-]?key|session[_-]?key)[A-Za-z0-9_.-]*';

// Nome de chave sensível por inteiro (chaves de objetos e Map).
const SENSITIVE_KEY_NAME_REGEX = new RegExp(`^${SENSITIVE_KEY_SOURCE}$`, 'i');

function isSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_NAME_REGEX.test(key);
}

// Ordem importa: blocos PEM inteiros, headers de autorização, atribuições sensíveis
// (chaves de API, tokens, senhas e valores de .env), credenciais em URLs e prefixos de token.
const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    name: 'PEM_BLOCK',
    mode: 'replace-all',
    regex: /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
  },
  {
    name: 'AUTHORIZATION_HEADER',
    mode: 'replace-value',
    regex:
      /((?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic|token|apikey)\s+)[^\s'"&,;]+/gi,
  },
  {
    name: 'ASSIGNED_SECRET',
    mode: 'replace-value',
    // Aspas opcionais na chave cobrem JSON/JS (`"password":"x"`); `\s*[=:]` cobre .env e afins.
    regex: new RegExp(
      `(${SENSITIVE_KEY_SOURCE}["']?\\s*[=:]\\s*)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;&]+)`,
      'gi',
    ),
  },
  {
    name: 'ASSIGNED_CONNECTION',
    mode: 'replace-value',
    regex:
      /([A-Za-z0-9_.-]*(?:database|db|mongo(?:db)?|redis|amqp|smtp|connection|dsn|uri)[A-Za-z0-9_.-]*\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;&]+)/gi,
  },
  {
    name: 'URL_CREDENTIALS',
    mode: 'replace-credentials',
    regex: /([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+):([^\s/@]+)(?=@)/gi,
  },
  {
    name: 'KNOWN_TOKEN_PREFIX',
    mode: 'replace-all',
    regex:
      /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|ghu_[A-Za-z0-9]{16,}|ghs_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9._-]{8,})?)\b/g,
  },
];

export const REDACTION_PATTERN_NAMES: readonly string[] = SECRET_PATTERNS.map((pattern) => {
  return pattern.name;
});

function applyPattern(text: string, pattern: SecretPattern): string {
  if (pattern.mode === 'replace-all') {
    return text.replace(pattern.regex, REDACTION_PLACEHOLDER);
  }
  if (pattern.mode === 'replace-credentials') {
    return text.replace(pattern.regex, `$1:${REDACTION_PLACEHOLDER}`);
  }
  return text.replace(pattern.regex, `$1${REDACTION_PLACEHOLDER}`);
}

/** Substitui padrões sensíveis por `[REDACTED]`; texto sem padrão sensível permanece intacto. */
export function redact(text: string): string {
  if (typeof text !== 'string') {
    throw new DomainError('REDACT_INPUT_INVALID', 'redact() exige texto (fail-closed).');
  }
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = applyPattern(result, pattern);
  }
  return result;
}

function redactValue(value: unknown, seen: Set<object>): unknown {
  if (typeof value === 'string') {
    return redact(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return REDACTION_PLACEHOLDER;
  }
  seen.add(value);
  const result = redactContainer(value, seen);
  seen.delete(value);
  return result;
}

function redactError(value: Error): unknown {
  // message/stack/name não são enumeráveis: serializados explicitamente e sempre redigidos.
  const output: Record<string, unknown> = {
    name: redact(value.name),
    message: redact(value.message),
  };
  if (typeof value.stack === 'string') {
    output['stack'] = redact(value.stack);
  }
  return output;
}

/**
 * Nome de chave sensível + valor string redige por inteiro (fail-closed): o valor pode não
 * conter padrão reconhecível (ex.: 'hunter2' sob 'password') e ainda assim é segredo.
 * Fora desse caso, o valor segue o caminho normal de `redactValue()`.
 */
function redactNamedEntry(key: unknown, entry: unknown, seen: Set<object>): unknown {
  if (typeof entry === 'string' && typeof key === 'string' && isSensitiveKeyName(key)) {
    return REDACTION_PLACEHOLDER;
  }
  return redactValue(entry, seen);
}

/**
 * Formas não-plain nunca passam intactas (fail-closed): Map/Set são reconstruídos com
 * redação recursiva, Error é serializado com redação, buffers/typed arrays viram
 * `[REDACTED]` e qualquer outra instância é serializada em objeto plain redigido.
 * Nome de chave sensível com valor string também vira `[REDACTED]`, mesmo sem padrão
 * no valor. Date permanece como está: não carrega texto livre para redigir.
 */
function redactContainer(value: object, seen: Set<object>): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item) => redactValue(item, seen));
  }
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Map) {
    const entries: Array<[unknown, unknown]> = [];
    for (const [key, entry] of value.entries()) {
      entries.push([redactValue(key, seen), redactNamedEntry(key, entry, seen)]);
    }
    return new Map(entries);
  }
  if (value instanceof Set) {
    const values: unknown[] = [];
    for (const entry of value.values()) {
      values.push(redactValue(entry, seen));
    }
    return new Set(values);
  }
  if (value instanceof Error) {
    return redactError(value);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return REDACTION_PLACEHOLDER;
  }
  const entries = Object.entries(value);
  const output: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    output[key] = redactNamedEntry(key, entry, seen);
  }
  return output;
}

/** Aplica `redact()` recursivamente a strings de objetos/arrays, sem mutar a entrada. */
export function redactObject(value: unknown): unknown {
  return redactValue(value, new Set<object>());
}
