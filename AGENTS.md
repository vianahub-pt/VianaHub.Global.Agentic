# VianaHub Global Agentic

Framework de engenharia agentic vendor-neutral da VianaHub: orquestração de sprints, loops de desenvolvimento, guardrails, memória, journaling, testes, segurança e revisão.

## Estado do repositório (bootstrap)

- Semente mínima do OpenCode instalada: `opencode.json`, este `AGENTS.md`, os agentes em `.opencode/agents/` e os comandos em `.opencode/commands/`.
- **Toolchain declarada no preparo pré-loop (autorizada pelo humano):** Node.js `>=24`, TypeScript, ESLint, Prettier, `c8` (cobertura statements) e runner nativo `node:test`. Os comandos estão em `package.json` e os gates nesta seção.
- **Não existe** código de framework (Agentic Core, adapters, profiles, monitor): apenas toolchain e um teste de sanidade da toolchain em `test/`.
- Arquitetura vendor-neutral e layout de diretórios são o **alvo da Sprint 0**, não fatos atuais.
- Nada pode ser presumido (banco de dados, framework web, gerenciador de pacotes alternativo) até ser declarado aqui.

## Architecture

- **Interface oficial:** OpenCode Desktop é a interface para executar o loop de Sprint
- **CLI scope:** a CLI serve apenas para manutenção/diagnóstico explicitamente autorizado de configuração
- **Artefatos de Sprint:** `docs/sprints/<sprint-id>/spec.md` e `docs/sprints/<sprint-id>/loop-state.md`
- **Toolchain:** Node.js `>=24` + TypeScript estrito (ESM/`nodenext`), declarados em `package.json` e `tsconfig.json`
- **Princípio arquitetônico:** Core define O QUE; adapters definem COMO uma ferramenta de IA executa; profiles definem COMO os gates genéricos mapeiam para a stack. TypeScript não acopla o Core ao OpenCode.

## Quality Gates (execution order)

Esta seção é a **única fonte de verdade** dos quality gates. O `sprint-tester` executa um gate por chamada, separadamente, e reporta comando, exit code e falha.

### Gates declarados

1. `git diff --check`
2. `npm run format:check`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run test:coverage`
7. `npm run build`
8. `npm run audit`

### Escopo de cada gate

- `git diff --check` — whitespace/merge markers em alterações rastreadas (gate original da semente).
- `npm run format:check` — Prettier em modo check sobre o escopo definido por `.prettierignore`. Os guardrails `opencode.json`, `AGENTS.md` e `.opencode/**` permanecem excluídos de reescrita automática.
- **Remediação canónica de formatação:** `npm run format:write -- <arquivo...>`. Este comando não é quality gate; é uma capability de remediação técnica pré-autorizada. Deve receber somente paths explícitos reportados pelo gate atual, sem curingas, e somente paths permitidos por `permission.edit` do `sprint-implementer`.
- Uma remediação exclusivamente mecânica por `format:write` não amplia o escopo funcional da Sprint. O diff resultante continua sujeito aos oito gates e às revisões independentes.
- `.gitattributes` é a fonte autoritativa de normalização de line endings do repositório. Arquivos de texto são normalizados para LF independentemente do `core.autocrlf` local.
- `npm run lint` — ESLint (flat config em `eslint.config.mjs`) sobre `**/*.ts` e `**/*.mjs`.
- `npm run typecheck` — `tsc --noEmit -p tsconfig.json` com `strict` e `erasableSyntaxOnly`.
- `npm test` — runner nativo `node:test` sobre `test/**/*.test.ts`.
- `npm run test:coverage` — `node scripts/coverage-gate.mjs` (wrapper sobre `c8`): universo = **todos** os módulos `src/**/*.ts` (exclui `*.d.ts`), com `--all` para que um módulo nunca importado também entre no relatório. Métrica autoritativa da Sprint: **statements ≥ 80%** (critério `TST-04`), thresholds `--statements/--branches/--functions/--lines = 80` com `--check-coverage`. Universo vazio (sem `src/`) imprime `COVERAGE_UNIVERSE_EMPTY` e **não constitui evidência de cobertura**: `TST-04` só é verificável quando `src/` existir. Módulo de `src/` ausente do relatório, resumo não gerado ou threshold reprovado = **FAIL** (fail-closed).
- `npm run build` — `tsc -p tsconfig.json`, emissão em `dist/` (gitignored).
- `npm run audit` — `npm audit --audit-level=high` sobre as dependências. O acesso read-only necessário ao registro npm para este gate declarado é pré-autorizado e não exige nova decisão humana. Registro indisponível continua sendo **FAIL**, nunca skip.

### Regras fail-closed

- Um gate declarado que não puder ser executado resulta em **FAIL**, nunca em skip silencioso.
- Comandos fora desta lista não podem ser executados como gate; cada gate executa exatamente o comando declarado acima e em `package.json`.
- Alterar esta lista, o comando de um gate ou o escopo de um gate (`.prettierignore`, `eslint.config.mjs`, `tsconfig.json`) exige edição humana: `AGENTS.md` está fora do escopo de edição de todos os agentes de Sprint.
- Nenhum gate pode ser removido ou rebaixado para fazer a Sprint passar; thresholds e severidade de auditoria só mudam por humano.

## Test Runner

- Runner declarado: **`node:test` (nativo do Node.js)** — nenhum framework de terceiros.
- Comando exato: `npm test` → `node --test "test/**/*.test.ts"`.
- Caminhos de teste autorizados: **`test/**/*.test.ts`** (somente este diretório).
- Comando de coverage: `npm run test:coverage`, mesmos caminhos, thresholds declarados em Quality Gates.
- Com este runner declarado, `NO_TEST_RUNNER_DECLARED` não ocorre nesta configuração: falha de execução do comando é FAIL normal de gate.
- Se esta seção voltar a não declarar runner (somente edição humana pode causar isso), o `sprint-tester` reporta `NO_TEST_RUNNER_DECLARED`.
- `NO_TEST_RUNNER_DECLARED` nunca equivale a PASS: o orquestrador deve encerrar com `BLOCKED_NEEDS_HUMAN`.
- Testes focados só podem ser executados nos caminhos declarados aqui.

## Conventions

- **Stack aprovada para a Sprint 0 (decisão humana):** Node.js `>=24` e TypeScript (`strict`, `erasableSyntaxOnly`, ESM/`nodenext`). Node executa os testes `.ts` por type stripping nativo.
- **Layout:** `src/` (código do framework, ainda inexistente), `test/` (testes), `docs/` (specs e estado de sprint); `dist/`, `coverage/`, `node_modules/` gerados e gitignored.
- **Formato:** Prettier (`.prettierrc.json`): LF, aspas simples, vírgula final, 100 colunas. `.gitattributes` fixa LF no checkout para eliminar divergência Windows/Linux.
- **Pacotes:** somente npm (`package.json` + `package-lock.json`); dependências apenas com necessidade concreta da Sprint.
- Estrutura detalhada de diretórios e a arquitetura vendor-neutral continuam sendo alvo da Sprint 0.

## Security Policies

- Nenhum segredo no repositório; arquivos `.env` e chaves privadas negados por padrão em `opencode.json`.
- Validação de entrada e proteção contra path traversal são requisitos de projeto, não detalhes já implementados.
- Nenhum acesso a infraestrutura externa durante o loop de Sprint sem autorização humana, **exceto** o acesso read-only estritamente necessário para executar um quality gate explicitamente declarado nesta seção, como `npm run audit`. Essa exceção não autoriza instalação, atualização, publicação, autenticação, deployment ou qualquer outra operação externa.
- SHA-pinned GitHub Actions e análise estática só entram quando o repositório ganhar CI (decisão humana).

## Agent Loop Rules

- **Escritor único por working tree:** apenas um agente edita código por vez.
- **Reviewers sempre somente leitura:** `sprint-security` e `sprint-reviewer` nunca editam arquivos.
- **Sem operações Git remotas:** commit, push, merge ou PR somente com autorização humana.
- **Status do repositório:** semente de bootstrap; sem uso em produção.
- **Escopo de Sprint:** definido exclusivamente por `docs/sprints/<sprint-id>/spec.md`.
- **Guardrails agentic:** `AGENTS.md`, `opencode.json` e `.opencode/**` mudam somente por edição humana.
- **Remediação técnica automática:** falhas determinísticas corrigíveis por capabilities previamente declaradas devem ser resolvidas pelos agentes, revalidadas e registradas sem intervenção humana.
- **Fronteira humana real:** `BLOCKED_NEEDS_HUMAN` é reservado para decisão de negócio/requisito, credencial ou segredo, operação destrutiva, produção/infraestrutura não pré-autorizada, mudança de policy/guardrail ou outra autorização que somente o humano possa conceder.
- **Falha técnica não é fronteira humana:** quando uma remediação técnica permitida falhar ou esgotar o budget, usar o estado técnico apropriado (`FAILED_QUALITY_GATES`, `MAX_ITERATIONS_REACHED` etc.), nunca converter automaticamente a falha em `BLOCKED_NEEDS_HUMAN`.

## Protocol tokens

Preserve exatamente os tokens de protocolo, incluindo `INVALID_ORCHESTRATOR_CONTEXT`, `AGENT_ROUTING_REQUIRED`, `INVALID_AGENT_ROUTING`, `AGENT_ROUTING_PASS`, `AGENT_OK:<agente>`, `BLOCKED_NEEDS_HUMAN`, `READY_FOR_HUMAN_REVIEW`, `MAX_ITERATIONS_REACHED`, `FAILED_QUALITY_GATES` e `NO_TEST_RUNNER_DECLARED`.

## Política obrigatória de idioma no OpenCode Desktop

- Toda comunicação de autoria do agente dirigida ao usuário e visível no OpenCode Desktop deve ser escrita em português do Brasil (`pt-BR`).
- Esta regra aplica-se independentemente do idioma utilizado pelo usuário no prompt.
- Isso inclui mensagens introdutórias, atualizações de progresso, explicações sobre ferramentas, títulos e textos de delegação, avisos, perguntas, resumos, relatórios e respostas finais.
- Produza diretamente em `pt-BR` todas as mensagens e respostas dirigidas ao usuário. O raciocínio ou pensamento visível gerado pelo modelo pode permanecer no idioma nativo do modelo.
- Antes de delegar, instrua cada subagente a manter em `pt-BR` toda comunicação visível dirigida ao usuário.
- Não traduza código, comandos, caminhos, nomes de arquivos, nomes de agentes, nomes de ferramentas ou identificadores técnicos.
- Preserve exatamente os tokens de protocolo, incluindo `INVALID_ORCHESTRATOR_CONTEXT`, `AGENT_ROUTING_REQUIRED`, `INVALID_AGENT_ROUTING`, `AGENT_ROUTING_PASS` e `AGENT_OK:<agente>`.
- Rótulos nativos da interface que não sejam produzidos pelos agentes ficam fora do controle desta política.

## OpenCode Agent Loop Interface

- **Official interface:** OpenCode Desktop is the official interface for running the agent loop
- **CLI scope:** the CLI is used only for explicitly authorized configuration maintenance and diagnostics
- **Validated baseline:** OpenCode CLI and Desktop version 1.18.30 no workflow de referência; confirmar a versão desta estação antes do loop controlado

### Required Procedure

1. Close and reopen Desktop after configuration changes
2. Create a genuinely new blank session
3. Confirm Sprint-Orchestrator is selected automatically
4. Run `/sprint-loop-check`
5. Require the five custom agents in exact order with their exact `AGENT_OK` tokens and final `AGENT_ROUTING_PASS`
6. Invalidate the check if any General, Build, Explore, Scout, fallback, missing, or substituted agent appears
7. Run `/sprint-loop` in the same session immediately after the successful check

### Fail-Closed Results

- `INVALID_ORCHESTRATOR_CONTEXT` — orchestrator context invalid
- `INVALID_AGENT_ROUTING` — agent routing invalid
- `AGENT_ROUTING_REQUIRED` — agent routing required but not satisfied

### Restrictions

- Build may be used only for explicitly authorized agent-configuration maintenance and must never implement Sprint work
- User-level configuration overrides and plugins remain disabled during the controlled Sprint loop
