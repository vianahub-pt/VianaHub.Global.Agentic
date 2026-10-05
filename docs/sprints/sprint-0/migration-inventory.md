# Inventário de migração — artefatos de bootstrap (MIG-01)

- Sprint: `sprint-0`
- Critério: `MIG-01`
- Data: 2026-10-02
- Status: ativo

## Objetivo

Inventariar os artefatos de bootstrap do repositório e classificar a autoria de cada um deles.
O inventário fixa o que é patrimônio humano (guardrail), o que é derivável dessa base humana e o
que é artefato neutro de produto/Sprint, eliminando ambiguidade sobre quem pode mudar o quê.

## Classificação de autoria

| Classe       | Significado                                                              | Regra de mutação                                        |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `humano`     | Redigido e mantido por decisão humana explícita.                          | Somente edição humana.                                  |
| `derivável`  | Conteúdo derivável da base humana (regras, convenções e comandos do loop). | Derivado da base `humano`; mutação restrita a humano.   |
| `neutro`     | Artefato de produto/Sprint (specs, estado, inventários, testes).          | Editável pelo loop de Sprint dentro do escopo de edição. |

Observação importante: a classe `derivável` descreve a **origem** do conteúdo (é derivável da base
humana), não uma permissão de mutação. Conforme as Agent Loop Rules, os guardrails agentic
(`AGENTS.md`, `opencode.json`, `.opencode/**`) mudam somente por edição humana.

## Inventário dos artefatos de bootstrap

| Artefato                | Classe      | Origem                                  | Regra de mutação             | Observações                                                                    |
| ----------------------- | ----------- | --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `AGENTS.md`             | `humano`    | Decisão humana (guardrail raiz)         | Somente edição humana        | Fonte única de verdade dos quality gates, do test runner e das convenções.      |
| `opencode.json`         | `humano`    | Decisão humana (configuração do OpenCode)| Somente edição humana       | Configuração de permissões/deny do OpenCode; define o modo fail-closed.         |
| `.opencode/agents/*`    | `derivável` | Derivável das regras declaradas em `AGENTS.md` | Somente edição humana | Definições dos cinco agentes custom (`sprint-orchestrator`, `sprint-implementer`, `sprint-tester`, `sprint-security`, `sprint-reviewer`). |
| `.opencode/commands/*`  | `derivável` | Derivável do loop declarado em `AGENTS.md`     | Somente edição humana | Comandos do loop (`sprint-loop`, `sprint-loop-check`) e seus tokens de protocolo. |
| `docs/sprints/*`        | `neutro`    | Artefatos de Sprint versionados        | Editável pelo loop           | `spec.md`, `loop-state.md`, inventários e demais artefatos da Sprint corrente.  |

## Regras derivadas do inventário

1. Nenhum agente de Sprint edita artefatos `humano` ou `derivável`: `AGENTS.md`, `opencode.json` e
   `.opencode/**` estão fora do escopo de edição de todos os agentes (deny-by-default).
2. Artefatos `neutro` em `docs/**`, `src/**`, `test/**`, `tests/**` (e as dependências autorizadas
   em `package.json`/`package-lock.json`) seguem o escopo de edição do `sprint-implementer`.
3. Qualquer necessidade de alterar um artefato `humano`/`derivável` encerra o trabalho com
   `BLOCKED_NEEDS_HUMAN`: a ampliação de escopo exige edição humana.
4. Novos artefatos criados durante a Sprint (por exemplo `docs/security/marketing-ops-exclusion.md`
   e os testes de `test/`) são `neutro` por derivação deste inventário e entram no mesmo regime de
   mutação dos artefatos `neutro`.
5. Artefatos gerados pela toolchain (`dist/`, `coverage/`, `node_modules/`) não são versionados e
   ficam fora deste inventário.

## Critérios cobertos

- `MIG-01` — Inventário dos artefatos de bootstrap com classificação de autoria
  (`humano`/`derivável`/`neutro`).
