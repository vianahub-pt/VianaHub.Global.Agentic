# Sprint 0: Fundação do Framework Agentic Vendor-Neutral

## Objetivo

Projetar e implementar a fundação do VianaHub.Global.Agentic como framework de engenharia agentic **reutilizável e vendor-neutral**: um Agentic Core executável e testável em Node.js/TypeScript, os contratos dos papéis canônicos, os protocolos de loop/estado/journal, as políticas de guardrail, a abstração de quality gates, os perfis de stack, os contratos de adapter (com OpenCode como primeiro adapter) e o Sprint Monitor como observabilidade vendor-neutral.

A Sprint 0 entrega uma **base executável e testável**, não a totalidade dos adapters e perfis futuros.

## Insumos e premissas

- Semente de bootstrap aprovada pelo humano nesta branch: `opencode.json`, `AGENTS.md`, `.opencode/agents/*`, `.opencode/commands/*`.
- Workflow de referência inspecionado: `VianaHub.Global.Marketing.Ops` (apenas o workflow `.opencode` / `AGENTS.md` / `docs/sprints/*`; **nunca** o aplicativo `automation/`).
- Princípio arquitetônico obrigatório:
  - **Core** define **O QUE** deve acontecer.
  - **Adapter** define **COMO** uma ferramenta de IA específica executa.
  - **Profile** define **COMO** os gates genéricos mapeiam para a stack de um projeto.
- **Monitor V4** — fonte exata: `C:\git\Monitor\MarketingOps-Sprint-Monitor-v4.0.ps1` (referência externa de bootstrap, leitura autorizada, **somente leitura**).

### Premissa a reconciliar — Monitor V4

A fonte exata do Monitor V4 foi localizada e lida: `C:\git\Monitor\MarketingOps-Sprint-Monitor-v4.0.ps1`. A análise de comportamento (reutilizável / acoplamento Marketing.Ops / suposições de bootstrap / configurável) e a validação de `MON-08` estão registradas em `docs/sprints/sprint-0/loop-state.md`. Esse script **não pode** se tornar dependência de runtime deste repositório: é referência de bootstrap, não componente do framework.

## Escopo

### 1. Agentic Core vendor-neutral

O Core é a biblioteca TypeScript que modela o workflow: tipos de domínio, máquina de estados do loop, contratos de porta (ports) e a lógica de orquestração agnóstica de ferramenta. Não conhece OpenCode, Codex, npm, GitHub nem nenhum outro vendor.

### 2. Contratos dos papéis (agent role contracts)

Contratos versionados e verificáveis para os seis papéis canônicos, com permissões, responsabilidades, proibições e tokens de protocolo. Os IDs dos papéis são imutáveis.

### 3. Protocolos de loop, estado e journal

Protocolo de fases do loop, checkpoints e retomada, limite de iterações e `FINAL_REMEDIATION`, persistência de estado (`loop-state`) e journal append-only com evidências.

### 4. Políticas de guardrail

Guardrails mecanicamente aplicáveis (permissões deny-by-default, arquivos protegidos, proibição de operações remotas e de acesso a segredos) mais as regras fail-closed do workflow.

### 5. Abstração de quality gates

Catálogo de gates **genéricos** (o quê verificar) desacoplado dos comandos **concretos** (como verificar em cada stack), com resultado estruturado e sem skip silencioso.

### 6. Perfis de stack/projeto (stack profiles)

Mecanismo declarativo que mapeia cada gate genérico para o comando real de um projeto. Pelo menos um perfil é implementado na Sprint 0; os demais são pontos de extensão.

### 7. Contratos de ferramentas (tool adapters)

Contrato de adapter que qualquer ferramenta de IA coding pode implementar, mais a infraestrutura de teste (adapter falso) necessária para validar o Core sem depender de um vendor real.

### 8. OpenCode como primeiro adapter

Implementação concreta do adapter para OpenCode: mapeamento dos seis papéis para agentes, gates, permissões e validação de roteamento. Os artefatos de bootstrap existentes passam a ser derivados/validados por ele.

### 9. Codex como adapter futuro (apenas design)

Codex é **objetivo de sprint futura**, não requisito de implementação da Sprint 0: apenas o contrato que ele precisará cumprir e a análise de aderência.

### 10. Sprint Monitor (observabilidade vendor-neutral)

Telemetria estruturada, versionada, redigida e vendor-neutral derivada das preocupações do Monitor V4, com sinks em arquivo e em memória e métricas derivadas.

## Não-objetivos (fora de escopo da Sprint 0)

### Migração proibida de domínio do Marketing.Ops

A Sprint 0 **não pode** copiar, migrar, reimplementar nem referenciar como dependência os componentes de negócio do Marketing.Ops, incluindo especificamente:

- orquestrador de automação de marketing (marketing automation orchestrator);
- integrações Google Business Profile;
- schedules/cron de marketing;
- persistência SQL do Marketing.Ops (migrations, `database/`, `opsdb`, `sqlcmd`);
- lógica de recuperação de domínio do Marketing.Ops (domain recovery);
- diretórios `automation/`, `brands/`, `data/`, `reports/`, `database/`;
- marcas, mercados, GERIT, `brands/gerit/`, `reports/gerit/`;
- `.env`, credenciais, tokens de plataforma, VPS, CAPTCHA/MFA/rate limits de terceiros.

### Demais não-objetivos

- Implementar o adapter Codex.
- Implementar perfis além do mínimo exigido pelo critério `PROF-02`.
- Publicar release, tag, pacote ou CHANGELOG público (apenas preparar o versionamento).
- Configurar CI/CD, GitHub Actions, CodeQL ou Dependabot (decisão humana, fora da Sprint).
- Alterar `develop`, `main` ou qualquer branch além desta.
- Commit, push, merge ou PR.
- Integração com banco de dados, API HTTP, frontend, scheduler ou infraestrutura externa.
- Abstrações especulativas sem consumidor no Sprint 0.

## Princípios e limites de arquitetura

1. **Core = O QUE.** Nenhum tipo, contrato ou regra do Core menciona um vendor.
2. **Adapter = COMO.** Toda particularidade de uma ferramenta (nomenclatura de agentes, comandos, formatos de roteamento) vive no adapter correspondente.
3. **Profile = COMO verificar.** Toda particularidade de stack para executar um gate vive no profile correspondente.
4. **Regra de dependência:** `adapter -> core` e `profile -> core`; **nunca** `core -> adapter`, `core -> profile` ou `adapter -> profile` por import direto.
5. **Sem abstração especulativa:** cada contrato introduzido no Sprint 0 possui exatamente um consumidor vivo no próprio Sprint 0 (Core, adapter OpenCode, perfil mínimo, monitor, adapter falso).
6. **Portas antes de implementações:** o Core define interfaces; a concretização vendor fica no adapter; a concretização de stack fica no profile.
7. **Fail-closed em todas as fronteiras:** estado desconhecido, gate indisponível, roteamento inválido ou entrada não validada resultam em erro/estado de parada, nunca em avanço silencioso.

## Papéis canônicos (agent role contracts)

Os seis papéis abaixo são canônicos. A Sprint 0 **não pode** acrescentar nem remover papéis; pode apenas contratar seus comportamentos.

| Papel (nome canônico) | id no adapter | Modo | Escopo de edição | Delegação (`task`) |
| --- | --- | --- | --- | --- |
| Sprint-Orchestrator | `sprint-orchestrator` | primary | somente `docs/sprints/**/loop-state.md` | lista fechada de 5 subagentes |
| Sprint-Architect | `sprint-architect` | subagent | nenhum (somente leitura) | negado |
| Sprint-Implementer | `sprint-implementer` | subagent | allow-list explícita, deny-by-default | negado |
| Sprint-Tester | `sprint-tester` | subagent | negado | negado |
| Sprint-Security | `sprint-security` | subagent | negado (somente leitura) | negado |
| Sprint-Reviewer | `sprint-reviewer` | subagent | negado (somente leitura) | negado |

Invariantes contratuais:

- Delegação exata, **sem fallback** para `general`, `build`, `explore`, `scout` ou qualquer agente substituto.
- **Escritor único** por working tree.
- Reviewers **sempre** somente leitura.
- Tokens de protocolo preservados byte a byte: `INVALID_ORCHESTRATOR_CONTEXT`, `AGENT_ROUTING_REQUIRED`, `INVALID_AGENT_ROUTING`, `AGENT_ROUTING_PASS`, `AGENT_OK:<agente>`, `BLOCKED_NEEDS_HUMAN`, `READY_FOR_HUMAN_REVIEW`, `MAX_ITERATIONS_REACHED`, `FAILED_QUALITY_GATES`, `NO_TEST_RUNNER_DECLARED`.
- Contrato de sondagem `ROUTING_PROBE_ONLY` (zero ferramentas, retorno somente do token `AGENT_OK:<agente>`).

## Protocolos de loop, estado e journal

### Fases do loop

`PREFLIGHT -> PLANNING -> IMPLEMENTING -> TESTING -> GATE_RUN -> REVIEWING -> REMEDIATING -> (próximo ciclo | estado terminal)`

### Limites e retomada

- Máximo de **5 ciclos** por execução.
- `FINAL_REMEDIATION`: no máximo **2 rounds**, sempre como extensão do ciclo 5 (nunca ciclo 6).
- Checkpoint persistente em `loop-state`: compatibilidade por **branch + SHA-base**; checkpoint compatível retoma no próximo passo; checkpoint incompatível ou estado que contradiça o working tree → `BLOCKED_NEEDS_HUMAN`.
- A mudança válida do próprio `loop-state.md` não é tratada como trabalho externo inesperado.

### Journal

- Append-only, imutável após gravado, com entradas tipadas e `schemaVersion`.
- Cada entrada registra: sprint, ciclo, iteração, fase, agente, ação, resultado, timestamp, branch e SHA-base.
- Redação obrigatória de segredos antes de qualquer persistência.

### Evidências

Cada estado terminal exige evidência registrada no `loop-state`: gates executados com comando e exit code, testes, findings por severidade e matriz de cobertura de critérios.

## Máquina de estados e estados terminais

### Estados

| Estado | Tipo | Significado |
| --- | --- | --- |
| `NOT_STARTED` | não terminal | loop não iniciado |
| `PREFLIGHT` | não terminal | preflight fail-closed em execução |
| `PLANNING` | não terminal | plano do architect |
| `IMPLEMENTING` | não terminal | incremento em construção |
| `TESTING` | não terminal | testes focados |
| `GATE_RUN` | não terminal | quality gates |
| `REVIEWING` | não terminal | reviews independentes de segurança e código |
| `REMEDIATING` | não terminal | correção dirigida de findings |
| `READY_FOR_HUMAN_REVIEW` | **terminal (sucesso)** | único estado de sucesso técnico |
| `BLOCKED_NEEDS_HUMAN` | **terminal** | exige intervenção humana |
| `MAX_ITERATIONS_REACHED` | **terminal** | limite de ciclos/rounds esgotado |
| `FAILED_QUALITY_GATES` | **terminal** | gates declarados reprovados |

### Regras de transição

- Estado inicial: `NOT_STARTED`; estado inicial efetivo do loop: `PREFLIGHT`.
- Transição inválida lança erro tipado (nunca é ignorada).
- `READY_FOR_HUMAN_REVIEW` somente quando **todas** as condições de sucesso forem verdadeiras (100% dos critérios, evidência por critério, gates e testes PASS, documentação concluída, 0 `BLOCKER`/`HIGH`/`MEDIUM`, `loop-state` completo e coerente).
- Qualquer critério pendente ao fim do ciclo 5 → `MAX_ITERATIONS_REACHED`, nunca `READY_FOR_HUMAN_REVIEW`.
- Falha de um gate declarado → o ciclo não conclui; repetição → `FAILED_QUALITY_GATES`.
- `NO_TEST_RUNNER_DECLARED` → nunca PASS → `BLOCKED_NEEDS_HUMAN`.
- Início de novo ciclo somente a partir de `REMEDIATING` ou `GATE_RUN` com findings ou critérios pendentes.

## Fronteiras de aprovação humana

Nenhuma ação abaixo pode ser executada por um agente de Sprint:

1. Editar guardrails: `AGENTS.md`, `opencode.json`, `.opencode/**`.
2. Alterar a lista de quality gates ou declarar o test runner em `AGENTS.md`.
3. Commit, push, merge, PR, rebase, reset ou qualquer operação Git remota.
4. Alterar `develop`/`main` ou criar branch fora do escopo autorizado.
5. Adicionar dependência não prevista na spec.
6. Acessar segredo, `.env`, credencial, chave ou infraestrutura externa.
7. Aplicar artefatos gerados pelo adapter sobre os guardrails (geração propõe; humano aplica).
8. Publicar versão/tag do framework.
9. Aprovar o próprio trabalho: `READY_FOR_HUMAN_REVIEW` encerra para revisão humana, nunca para auto-aprovação.
10. Rebaixar severidade de finding ou dispensar critério de aceitação.

## Políticas de guardrail e segurança

- Permissões **deny-by-default** em todos os agentes; allow-list explícita e revisável.
- Leitura de `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519` negada por padrão.
- Nenhum segredo no repositório; redação de segredos em journal, monitor e mensagens de erro.
- Sem operações Git remotas e sem infraestrutura externa durante o loop.
- Testes **sem rede**: nenhuma chamada externa em execução de teste.
- Guardrails e capacidade de falha fail-closed: gate declarado indisponível = FAIL, nunca skip.
- **Anti-migração:** o repositório do framework não contém caminho, import, copy ou script do domínio Marketing.Ops listado em Não-objetivos; a verificação é automatizável e faz parte dos critérios.
- Dependências mínimas, auditáveis e pinadas; nenhum SDK de vendor no Core.

## Abstração de quality gates

- **Gate genérico** = `id` estável + ordem + intenção + comando resolvido pelo profile.
- Catálogo mínimo exigido: `whitespace` (`git diff --check`), `format`, `lint`, `typecheck`, `test`, `coverage`, `build`, `audit`.
- **Resultado de gate** estruturado: `gateId`, comando exato, exit code, duração, `PASS`/`FAIL`/`UNAVAILABLE`, stdout/stderr truncado e redigido.
- Fonte de verdade dos gates aplicáveis é `AGENTS.md` (somente humano edita); o Core apenas consome o catálogo declarado.
- Gate fora do catálogo não pode ser executado como gate.
- Gate declarado e não executável = `FAIL` (fail-closed), com parada `FAILED_QUALITY_GATES`.
- Ausência de runner declarado = `NO_TEST_RUNNER_DECLARED` → `BLOCKED_NEEDS_HUMAN`.
- Execução um gate por chamada, na ordem declarada, com evidência por gate.

## Perfis de stack/projeto

- `StackProfile` declara **quais** gates valem e **qual** comando cada um executa naquela stack.
- Perfil é **declarativo** (dados), não código imperativo.
- Pelo menos um perfil completo é implementado na Sprint 0 (stack Node.js/TypeScript deste repositório).
- Perfis são substituíveis/estendíveis sem alterar o Core.
- Perfil ausente ou gate sem mapeamento no perfil → estado `UNAVAILABLE`/fail-closed, nunca execução improvisada.
- Perfis para outras stacks (Python, Go etc.) são futuros; a Sprint 0 só precisa garantir que adicioná-los não exige tocar no Core.

## Ferramentas adapters

### Contrato

`AgenticAdapter` expõe, no mínimo: identificar os papéis, aplicar roteamento, reportar estado de roteamento, traduzir gates para comandos via profile, serializar/deserializar `loop-state` e emitir eventos ao monitor. O contrato é testável com um adapter falso em memória.

### OpenCode (implementado na Sprint 0)

- Mapeia os seis papéis canônicos para os agentes do adapter, preservando modos, permissões e tokens.
- Implementa a validação de roteamento equivalente a `/sprint-loop-check` (5 sondagens, tokens exatos, zero ferramentas, sem fallback) de forma vendor-neutral.
- Deriva/valida os artefatos `.opencode/agents/*`, `.opencode/commands/*` e `opencode.json` a partir do contrato.
- A aplicação sobre guardrails é **proposta** ao humano; o adapter não edita `AGENTS.md`, `opencode.json` nem `.opencode/**` por conta própria.
- Não há dependência do OpenCode no Core.

### Codex (apenas design)

- Nenhuma implementação, nenhum pacote, nenhum script.
- Entregável: declaração do contrato a cumprir e matriz de aderência/diferenças (o que o Codex exige e o que o Core já cobre).

## Sprint Monitor (observabilidade vendor-neutral)

- **Eventos** versionados e estruturados (JSON): início/fim de sprint, início/fim de ciclo, transição de estado, delegação/agente, resultado de gate, finding com severidade, critério concluído, estado terminal e motivo.
- Cada evento carrega correlação: `sprintId`, `cycle`, `iteration`, `phase`, `role`, `branch`, `shaBase`, `timestamp`, `schemaVersion`.
- **Redação** obrigatória de segredos/padrões sensíveis antes de persistir.
- **Sinks**: arquivo dentro do workspace (append-only) e sink em memória para testes; nenhum SDK de vendor; nenhuma escrita fora do workspace.
- **Métricas derivadas**: ciclos consumidos, duração por fase, gates PASS/FAIL/UNAVAILABLE, findings por severidade, tempo até estado terminal.
- **Vendor-neutral**: nenhum conceito específico de OpenCode/Codex no formato do evento; a tradução é responsabilidade do adapter.
- Testável sem rede e sem dependência de vendor.
- Requisitos reconciliados com o Monitor V4 (fonte exata em Insumos e premissas; análise em `loop-state.md`).
- O monitor observa o protocolo de forma independente do motor de execução (OpenCode, Codex ou adapter futuro): nenhum evento, formato ou sink depende de um vendor.
- O script V4 é referência de bootstrap e **não** dependência de runtime do framework.

## Migração bootstrap → framework

- **Inventário** dos artefatos de bootstrap e classificação de autoria: humano (`AGENTS.md`, `opencode.json`), derivável do adapter (`.opencode/agents/*`, `.opencode/commands/*`) ou neutro.
- **Paridade**: após a derivação, os artefatos devem preservar tokens, ordem de delegação, permissões fail-closed e estados terminais da semente aprovada.
- Migração **não destrutiva**: nada é substituído sem diff revisável e aprovação humana.
- Guardrails continuam sob autoria humana: o framework **gera proposta**, o humano **aplica**.
- Nenhuma dependência do Marketing.Ops é criada durante a migração.
- A semente de bootstrap deve continuar executável após a migração (o workflow `/sprint-loop-check` e `/sprint-loop` não pode regredir).

## Versionamento e adoção por consumidores

- Framework versionado por **SemVer** com tags imutáveis e `CHANGELOG.md`.
- Consumidores **não** rastreiam `develop` nem `main`: dependem de versão publicada e dão upgrade de forma explícita.
- Mudanças quebradoras exigem nota de migração no `CHANGELOG.md`.
- A Sprint 0 prepara a estrutura de versionamento; a publicação é decisão humana (fronteira de aprovação).
- O repositório do framework não pode presumir o layout ou a branch de nenhum consumidor.

## Critérios de Aceitação

IDs estáveis: prefixo da área + número sequencial. **Uma vez publicado, um ID nunca muda, não é reutilizado e não é renomeado.**

### Core vendor-neutral (CORE)

- [ ] **CORE-01** Projeto Node.js/TypeScript na raiz com `package.json` e `tsconfig` estrito.
- [ ] **CORE-02** `npm run typecheck` executa e aprova sem `any` implícito.
- [ ] **CORE-03** Tipos canônicos definidos: `Role`, `Phase`, `LoopState`, `TerminalState`, `GateId`, `GateResult`, `Severity`, `Finding`, `JournalEntry`, `MonitorEvent`.
- [ ] **CORE-04** Máquina de estados do loop com transições validadas por função própria.
- [ ] **CORE-05** Transição inválida lança erro tipado (ex.: `PREFLIGHT -> READY_FOR_HUMAN_REVIEW`).
- [ ] **CORE-06** Contrato `AgenticAdapter` definido como porta (interface), sem implementação vendor.
- [ ] **CORE-07** Contrato `StackProfile` definido como porta, sem comando concreto embutido.
- [ ] **CORE-08** Contrato `GateCatalog`/`Gate` e `GateResult` definidos.
- [ ] **CORE-09** Contrato `JournalSink` (append-only) e `Monitor` definidos.
- [ ] **CORE-10** Nenhum import do Core referencia adapter, profile ou pacote de vendor (verificação automatizada).
- [ ] **CORE-11** Zero dependências de vendor/SDK no Core (apenas devDependencies de toolchain, se necessárias).
- [ ] **CORE-12** Erros de domínio tipados e fail-closed; nenhum `catch` que engula falha de gate ou de roteamento.

### Papéis canônicos (ROLE)

- [ ] **ROLE-01** Os seis papéis canônicos declarados com IDs exatos e imutáveis.
- [ ] **ROLE-02** Contrato por papel com modo, escopo de edição, permissões `bash`/`task` e responsabilidades.
- [ ] **ROLE-03** Regra de delegação exata sem fallback expressa em contrato testável.
- [ ] **ROLE-04** Regra de escritor único por working tree expressa em contrato.
- [ ] **ROLE-05** Somente-leitura mecânico (não apenas prosa) para `sprint-security` e `sprint-reviewer`.
- [ ] **ROLE-06** Os dez tokens de protocolo preservados e validados por teste.
- [ ] **ROLE-07** Contrato `ROUTING_PROBE_ONLY` (zero ferramentas, retorno só do token) especificado.
- [ ] **ROLE-08** Nenhum papel é acrescentado ou removido em relação à lista canônica.

### Loop, estado e journal (LOOP)

- [ ] **LOOP-01** Os oito estados não terminais definidos e as transições entre eles implementadas.
- [ ] **LOOP-02** Os quatro estados terminais definidos; `READY_FOR_HUMAN_REVIEW` é o único de sucesso.
- [ ] **LOOP-03** Limite de 5 ciclos implementado e testado.
- [ ] **LOOP-04** `FINAL_REMEDIATION` limitado a 2 rounds e proibido ciclo 6.
- [ ] **LOOP-05** `loop-state` versionado (`schemaVersion`), com branch, SHA-base, status e iteração.
- [ ] **LOOP-06** Retomada por checkpoint compatível com branch + SHA-base; incompatibilidade → parada.
- [ ] **LOOP-07** Contradição entre `loop-state` e working tree/spec/evidências → `BLOCKED_NEEDS_HUMAN`.
- [ ] **LOOP-08** Journal append-only tipado, imutável após gravação e redigido.
- [ ] **LOOP-09** Condições exclusivas de sucesso implementadas (todas as 6) e verificadas por teste negativo.
- [ ] **LOOP-10** Evidência obrigatória por estado terminal (gates, testes, findings, cobertura) validada.

### Guardrails (GUARD)

- [ ] **GUARD-01** Lista de arquivos guardrail declarada (`AGENTS.md`, `opencode.json`, `.opencode/**`).
- [ ] **GUARD-02** Permissões deny-by-default com allow-list explícita em todos os papéis.
- [ ] **GUARD-03** Padrões de leitura de segredo negados e verificados por teste.
- [ ] **GUARD-04** Proibição de operação Git remota expressa em contrato e verificável.
- [ ] **GUARD-05** Nenhum acesso a infraestrutura externa no loop de Sprint.
- [ ] **GUARD-06** Checklist de exclusão do domínio Marketing.Ops publicado em documentação.
- [ ] **GUARD-07** Varredura automatizada do repositório: nenhum caminho/import/script do domínio Marketing.Ops proibido.
- [ ] **GUARD-08** Fail-closed: nenhuma falha de gate, roteamento ou validação é convertida em sucesso silencioso.

### Quality gates (GATE)

- [ ] **GATE-01** Catálogo mínimo de 8 gates genéricos definido com IDs estáveis.
- [ ] **GATE-02** Separação entre gate genérico (intenção) e comando concreto (profile) comprovada.
- [ ] **GATE-03** `GateResult` estruturado com comando, exit code, duração e veredito.
- [ ] **GATE-04** Gate fora do catálogo não pode ser executado como gate.
- [ ] **GATE-05** Gate declarado indisponível resulta em `FAIL`, nunca em skip.
- [ ] **GATE-06** Ausência de runner → `NO_TEST_RUNNER_DECLARED` → `BLOCKED_NEEDS_HUMAN`.
- [ ] **GATE-07** Execução um-por-chamada, na ordem declarada, com evidência por gate.
- [ ] **GATE-08** `AGENTS.md` permanece fonte de verdade dos gates aplicáveis e só muda por humano.
- [ ] **GATE-09** Os scripts de gate da Sprint 0 existem e são executáveis nesta stack.

### Perfis (PROF)

- [ ] **PROF-01** Contrato `StackProfile` cobre todos os 8 gates do catálogo.
- [ ] **PROF-02** Pelo menos um perfil completo (stack Node.js/TypeScript) implementado.
- [ ] **PROF-03** Perfil declarativo (dados), sem lógica imperativa de execução.
- [ ] **PROF-04** Gate sem mapeamento no perfil → `UNAVAILABLE`/fail-closed.
- [ ] **PROF-05** Trocar ou adicionar perfil não exige alteração no Core (teste de substituição).
- [ ] **PROF-06** Perfis adicionais (outras stacks) documentados como extensão futura, fora do Sprint 0.

### Adapters (ADP)

- [ ] **ADP-01** `AgenticAdapter` cobre: papéis, roteamento, gates, `loop-state` e monitor.
- [ ] **ADP-02** Adapter OpenCode implementado sobre o contrato.
- [ ] **ADP-03** Mapeamento dos seis papéis com modos, permissões e tokens preservados.
- [ ] **ADP-04** Validação de roteamento vendor-neutral equivalente a `/sprint-loop-check` (5 sondagens, tokens exatos, zero ferramentas, sem fallback) com teste.
- [ ] **ADP-05** Geração/validação dos artefatos `.opencode/**` e `opencode.json` a partir do contrato, como **proposta** (sem aplicação automática).
- [ ] **ADP-06** Adapter falso em memória permite testar o Core sem vendor real.
- [ ] **ADP-07** Core sem dependência do OpenCode (teste de dependência).
- [ ] **ADP-08** Paridade da semente aprovada verificada após derivação (tokens, delegação, permissões, estados).
- [ ] **ADP-09** Nenhum adapter além do OpenCode é implementado.

### Codex futuro (CODX)

- [ ] **CODX-01** Contrato exigido do adapter Codex documentado.
- [ ] **CODX-02** Matriz de aderência/diferenças (Core vs. exigências do Codex) publicada.
- [ ] **CODX-03** Nenhum código, pacote ou script de Codex existe no repositório.

### Sprint Monitor (MON)

- [ ] **MON-01** Catálogo de eventos versionado (`schemaVersion`) e estruturado.
- [ ] **MON-02** Eventos de ciclo de vida: sprint, ciclo, fase, transição, delegação, gate, finding, critério, estado terminal.
- [ ] **MON-03** Correlação obrigatória: `sprintId`, `cycle`, `iteration`, `phase`, `role`, `branch`, `shaBase`, `timestamp`.
- [ ] **MON-04** Redação de segredos antes de qualquer persistência, com teste.
- [ ] **MON-05** Sink de arquivo append-only dentro do workspace e sink em memória para testes.
- [ ] **MON-06** Nenhum SDK de vendor e nenhuma escrita fora do workspace.
- [ ] **MON-07** Métricas derivadas calculáveis a partir dos eventos (ciclos, duração, gates, findings).
- [ ] **MON-08** Requisitos reconciliados com o Monitor V4 e reconciliação registrada em documentação.
- [ ] **MON-09** Testes do monitor executam sem rede.

### Migração bootstrap → framework (MIG)

- [ ] **MIG-01** Inventário dos artefatos de bootstrap com classificação de autoria.
- [ ] **MIG-02** Derivação dos artefatos `.opencode/**` pelo adapter OpenCode.
- [ ] **MIG-03** Verificação de paridade automática entre semente aprovada e artefatos derivados.
- [ ] **MIG-04** Guardrails seguem sob autoria humana; geração é proposta, aplicação é humana.
- [ ] **MIG-05** Migração não destrutiva: diff revisável e reversível.
- [ ] **MIG-06** Workflow `/sprint-loop-check` + `/sprint-loop` não regrediu após a migração.
- [ ] **MIG-07** Nenhuma dependência do Marketing.Ops criada pela migração.

### Versionamento e consumidores (REL)

- [ ] **REL-01** Estrutura SemVer e `CHANGELOG.md` preparados.
- [ ] **REL-02** Política documentada: consumidores não rastreiam `develop`/`main`.
- [ ] **REL-03** Upgrade de consumidor é explícito e documentado (guia de upgrade).
- [ ] **REL-04** Mudanças quebradoras exigem nota de migração no `CHANGELOG.md`.
- [ ] **REL-05** Nenhuma publicação de versão é feita pela Sprint 0 (fronteira humana).

### Testes e execução (TST)

- [ ] **TST-01** Test runner declarado e executável (`AGENTS.md`, declaração humana) — pré-condição do loop.
- [ ] **TST-02** Testes unitários para máquina de estados, contratos e transições inválidas.
- [ ] **TST-03** Testes de integração do loop com adapter falso cobrindo o caminho feliz e as 4 paradas terminais.
- [ ] **TST-04** Cobertura mínima de 80% statements.
- [ ] **TST-05** Nenhum teste requer rede, credencial ou vendor real.
- [ ] **TST-06** Todos os gates declarados executam e aprovam.

### Documentação (DOC)

- [ ] **DOC-01** Documento de arquitetura com limites Core/Adapter/Profile e regra de dependência.
- [ ] **DOC-02** Guia "como escrever um adapter" e "como escrever um profile".
- [ ] **DOC-03** Registro de decisões (ADR) para pilares: vendor-neutral, deny-by-default, gates declarativos, consumidores sem branch tracking.
- [ ] **DOC-04** README do repositório atualizado com estado real (Sprint 0, sem uso em produção).

## Quality Gates (da Sprint)

Fonte de verdade: `AGENTS.md`. Execução um por chamada, na ordem, com comando e exit code.

| # | Gate | Situação na Sprint 0 |
| --- | --- | --- |
| 1 | `git diff --check` | declarado na semente; executável hoje |
| 2 | `format` | declarado e executável (`npm run format:check`) — resolvido no preparo pré-loop |
| 3 | `lint` | declarado e executável (`npm run lint`) — resolvido no preparo pré-loop |
| 4 | `typecheck` | declarado e executável (`npm run typecheck`) — resolvido no preparo pré-loop |
| 5 | `test` | declarado e executável (`npm test`, runner `node:test`) — resolvido no preparo pré-loop |
| 6 | `coverage` | declarado e executável (`npm run test:coverage` → `c8`); **TST-04 em statements ≥ 80%**, universo `src/**/*.ts` com `--all`; sem `src/` ainda imprime `COVERAGE_UNIVERSE_EMPTY` (não é evidência) |
| 7 | `build` | declarado e executável (`npm run build`) — resolvido no preparo pré-loop |
| 8 | `audit` | declarado e executável (`npm run audit`) — resolvido no preparo pré-loop |

Regras: gate declarado indisponível = `FAIL`; gate não declarado não executa; ausência de runner = `NO_TEST_RUNNER_DECLARED` → `BLOCKED_NEEDS_HUMAN`.

## Riscos e dependências

1. **Runner e gates declarados** — resolvido no preparo pré-loop: `node:test` e os 8 gates declarados em `AGENTS.md`. Risco residual: o gate `coverage` passa sobre conjunto vazio enquanto `src/` não existir; evidência real de cobertura só existe com código de produto.
2. **Monitor V4** — fonte localizada e lida (`C:\git\Monitor\MarketingOps-Sprint-Monitor-v4.0.ps1`); análise e validação de `MON-08` em `loop-state.md`. Discrepâncias conhecidas registradas sem alterar o sentido de nenhum critério.
3. **Guardrails sob autoria humana** — a migração dos artefatos `.opencode/**` exige aprovação humana para aplicar.
4. **Escopo amplo em 5 ciclos** — a matriz de cobertura do architect é obrigatória para evitar `MAX_ITERATIONS_REACHED`.
5. **Tentação de migração do Marketing.Ops** — mitigada por `GUARD-06`/`GUARD-07` e pela lista explícita de Não-objetivos.

## Status

- **Estado desta spec:** **APROVADA pelo humano** (revisão pré-loop); `loop-state` em `NOT_STARTED`.
- **Pré-requisitos pré-loop resolvidos:** toolchain Node.js/TypeScript, test runner `node:test`, os 8 quality gates declarados em `AGENTS.md` e `package.json` (todos PASS na validação), fonte do Monitor V4 localizada e analisada.
- **Próximo passo:** aguardar autorização humana explícita para `/sprint-loop-check` e `/sprint-loop sprint-0` em sessão nova do OpenCode Desktop. **Nenhuma implementação de produto foi iniciada.**
- **Produção:** o framework permanece sem uso em produção até decisão humana em release versionado.
