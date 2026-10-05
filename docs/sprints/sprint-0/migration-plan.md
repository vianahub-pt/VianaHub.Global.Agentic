# Plano de migração — Sprint 0 (MIG-04)

- Sprint: `sprint-0`
- Critério: `MIG-04`
- Data: 2026-10-02
- Status: ativo

## Objetivo

Definir as propriedades da migração de bootstrap do repositório `VianaHub.Global.Agentic` de
modo que ela seja **não-destrutiva**, revisável e reversível, preservando os guardrails humanos
como base imutável para o loop de Sprint.

## Princípio não-destrutivo

A migração de bootstrap é composta exclusivamente por:

1. Adição de novos artefatos de produto (`src/**`, `test/**`, `docs/**`, `package.json`,
   `package-lock.json`).
2. Manutenção de artefatos `neutro` já existentes em `docs/sprints/sprint-0/`.
3. Nenhuma remoção ou alteração dos artefatos `humano`/`derivável` listados no
   `migration-inventory.md`.

Consequência direta: o `git diff` da migração contém apenas alterações autorizadas ao loop de
Sprint. Qualquer mudança não prevista pode ser revertida com `git checkout` ou equivalente sem
comprometer a base de guardrails do repositório.

## Reversibilidade

- Todo arquivo criado ou modificado pelo loop de Sprint está em caminhos dentro do escopo de
  edição (`docs/**`, `src/**`, `test/**`, `tests/**`, `package.json`, `package-lock.json`).
- Nenhum guardrail (`AGENTS.md`, `opencode.json`, `.opencode/**`) é alterado por agentes.
- O estado pré-migração é recuperável enquanto o diff não for commitado, e após o commit por
  meio de reversão do commit correspondente.

## Guardrails editados apenas por humanos

Conforme `migration-inventory.md` e as Agent Loop Rules:

- `AGENTS.md` — guardrail raiz; somente edição humana.
- `opencode.json` — configuração de permissões/deny do OpenCode; somente edição humana.
- `.opencode/agents/*` e `.opencode/commands/*` — deriváveis dos guardrails humanos; somente
  edição humana.

Se qualquer necessidade de Sprint exigir mudança nesses artefatos, o trabalho deve parar com
`BLOCKED_NEEDS_HUMAN`: a ampliação de escopo exige edição humana de
`.opencode/agents/sprint-implementer.md` ou do guardrail correspondente.

## Referências

- `docs/sprints/sprint-0/migration-inventory.md` — classificação de autoria dos artefatos de
  bootstrap (`humano`/`derivável`/`neutro`).
- `AGENTS.md` — Agent Loop Rules e restrições de escopo de edição.

## Critérios cobertos

- `MIG-04` — Plano de migração não-destrutiva, reversível, com guardrails editados apenas por
  humanos.
