// ADP-10 — Políticas específicas do adapter OpenCode (vendor-specific).
// Padrões de guardrail extras que o Core aplica quando o adapter participa da decisão.
export const OPENCODE_GUARDRAIL_PATTERNS: readonly string[] = Object.freeze([
  'opencode.json',
  '.opencode/**',
]);
