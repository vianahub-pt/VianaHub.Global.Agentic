# Matriz de aderência Core × Codex (CODX-02)

| Campo | Valor |
| --- | --- |
| ID | CODX-02 |
| Artefato | `docs/adapters/codex-aderencia.md` |
| Status | Análise de design (Sprint 0) |
| Escopo | Matriz de aderência/diferenças entre o Core vendor-neutral e as exigências do Codex |

## 1. Propósito

Publicar, item a item, **o que o Codex exige** de um adapter de ferramenta de IA e **o que o Core já
cobre**, explicitando diferenças e ações pendentes. Complementa o contrato de
`docs/adapters/codex-contrato.md` (CODX-01) e materializa o critério CODX-02.

Legenda da coluna "Situação":

- **ADERENTE** — o Core cobre a exigência sem mudança.
- **ADERENTE VIA ADAPTER** — o Core cobre a porta; a particularidade vive no adapter Codex (futuro).
- **DIFERENÇA** — comportamento do Codex que o Core não modela e que exige decisão/ação explícita.
- **FORA DE ESCOPO** — exigência do Codex que o framework deliberadamente não absorve.

## 2. Matriz

| # | Exigência do Codex | Cobertura no Core (referência) | Situação | Nota / ação |
| --- | --- | --- | --- | --- |
| M-01 | Contrato único de integração com a ferramenta | Porta `AgenticAdapter` (`src/core/ports.ts`), 7 operações | ADERENTE VIA ADAPTER | Codex implementa a porta; ver CODX-01 seção 3. |
| M-02 | Identificação estável dos 6 papéis canônicos | `ROLES`, `ROLE_CONTRACTS` (`src/core/types.ts`, `src/core/roles.ts`) | ADERENTE | Codex não possui papéis nativos; `identifyRoles()` devolve os IDs canônicos. |
| M-03 | Mapeamento papel -> subagente/ferramenta do vendor | Binding é responsabilidade do adapter (padrão do `OpenCodeAdapter`) | ADERENTE VIA ADAPTER | Binding Codex vive em `src/adapters/codex/`; nunca no Core. |
| M-04 | Roteamento fail-closed sem fallback | `applyRouting`/`reportRoutingStatus` + `assertRoutingPass` (`src/core/routing.ts`) | ADERENTE | `AGENT_ROUTING_PASS` é o único status que avança. |
| M-05 | Validação de roteamento com 5 sondagens e tokens exatos | `ROUTING_PROBE_CONTRACT`, `agentOkToken` (`src/core/roles.ts`, `src/core/tokens.ts`) | ADERENTE VIA ADAPTER | Adapter Codex reproduz as sondagens no formato do vendor; tokens byte a byte idênticos. |
| M-06 | Execução de quality gates na stack do projeto | `GATE_CATALOG` + `resolveGate(gate, profile)` (`src/core/gates.ts`) | ADERENTE | Codex não tem gates próprios: o profile do projeto fornece os comandos. |
| M-07 | Tradução gate -> comando por stack | `StackProfile` declarativo (`src/core/ports.ts`) | ADERENTE | Reuso puro; o adapter Codex apenas consome o profile. |
| M-08 | Resultado de gate estruturado e sem skip silencioso | `GateResult`, `GateResolution` (`RESOLVED`/`UNAVAILABLE`) | ADERENTE | `UNAVAILABLE` é fail-closed, nunca execução improvisada. |
| M-09 | Serialização/desserialização de `loop-state` | `serializeLoopState`/`deserializeLoopState` + validação `isLoopState` | ADERENTE VIA ADAPTER | Codex pode persistir de outra forma; a validação fail-closed é do contrato. |
| M-10 | Máquina de estados do loop com estados terminais | `src/core/state-machine.ts`, `src/core/loop.ts` | ADERENTE | Nada específico do Codex a modelar. |
| M-11 | Emissão de eventos ao monitor vendor-neutral | `emit(event)` + `MonitorEvent` (`src/core/types.ts`) | ADERENTE VIA ADAPTER | Tradução de vocabulário Codex -> `MonitorEvent` é do adapter (MON-06). |
| M-12 | Correlação obrigatória em eventos | `MonitorCorrelation` (`src/monitor/events.ts`) | ADERENTE | Idêntico para qualquer vendor. |
| M-13 | Redação de segredos em erros/eventos/saída | `redact`, `redactObject` (`src/core/redact.ts`) | ADERENTE | Adapter Codex **deve** redigir chaves da OpenAI na fronteira (F-05). |
| M-14 | Permissões deny-by-default por papel | `checkEdit`, `PermissionRuleSet.denyByDefault` (`src/core/guards.ts`, `src/core/roles.ts`) | ADERENTE | Espelhado em runtime pelo adapter (F-07). |
| M-15 | Proibição de rede/infra externa no loop | `checkExternalInfrastructure`, `assertNoNetworkImports` (GUARD-05) | DIFERENÇA | Codex é ferramenta de IA que **requer** chamada externa em uso real: o modo simulado/real deve ser declarado (F-06) e a execução real exige autorização humana explícita. |
| M-16 | Credenciais sem segredos no repositório | `SECRET_PATH_PATTERNS`, negação de leitura (GUARD-03) | DIFERENÇA | Codex exige credencial de runtime (ex.: `OPENAI_API_KEY`): contrato exige `MISSING_CREDENTIALS` fail-closed (F-04); nada em `.env` versionado. |
| M-17 | Journal append-only redigido | `src/core/journal.ts` | ADERENTE | Sem particularidade Codex. |
| M-18 | Tratamento de timeout/cancelamento de execução | Sem correspondente no Core (a porta não executa prompts) | DIFERENÇA | Obrigações F-09 (timeout explícito, cancelamento cooperativo, sem processo órfão) ficam no adapter Codex. |
| M-19 | Taxonomia de erros tipados e fail-closed | `DomainError` e subclasses (`src/core/errors.ts`) | ADERENTE VIA ADAPTER | Adapter Codex normaliza erros do vendor para a taxonomia da seção 6 de CODX-01. |
| M-20 | Testes sem rede/credencial/vendor real | Política TST-05; adapter falso em memória (`src/adapters/fake/fake-adapter.ts`) | ADERENTE | Testes futuros do Codex usam modo simulado determinístico. |
| M-21 | Capacidades de sandbox/configuração por execução | Fora da porta `AgenticAdapter` | FORA DE ESCOPO | Configuração do Codex é declarada e validada no adapter (F-03); o Core não modela sandbox de vendor. |
| M-22 | Uso de SDK/pacote do Codex no projeto | `CORE-11` (zero dependências de vendor no Core) | FORA DE ESCOPO | Nenhum SDK de vendor entra no Core; um futuro adapter Codex avalia a dependência caso a caso, com decisão humana (hoje: zero — CODX-03). |
| M-23 | Interface de usuário/chat do Codex | Não modelado no framework | FORA DE ESCOPO | A interface oficial do loop de Sprint é o OpenCode Desktop (AGENTS.md). |
| M-24 | Versionamento e upgrade por consumidores | SemVer + `CHANGELOG.md` + `docs/versionamento.md` (REL-01..05) | ADERENTE | Política única para qualquer adapter. |

## 3. Síntese

| Situação | Itens | Total |
| --- | --- | --- |
| ADERENTE | M-02, M-04, M-06, M-07, M-08, M-10, M-12, M-13, M-14, M-17, M-20, M-24 | 12 |
| ADERENTE VIA ADAPTER | M-01, M-03, M-05, M-09, M-11, M-19 | 6 |
| DIFERENÇA | M-15, M-16, M-18 | 3 |
| FORA DE ESCOPO | M-21, M-22, M-23 | 3 |
| **Total** | | **24** |

## 4. Diferenças que exigem decisão humana

1. **M-15 (rede):** o Codex só executa trabalho real contra infraestrutura externa. O framework
   exige modo simulado/real declarado e autorização humana para execução real — decisão pendente
   quando a implementação for autorizada.
2. **M-16 (credenciais):** a credencial do Codex existe apenas em runtime (variável de ambiente ou
   provedor humano). Nenhuma política do framework permite commitar `.env`, chave ou token.
3. **M-18 (timeout/cancelamento):** sem correspondente na porta atual; as obrigações ficam no
   adapter (F-09) e não alteram o Core.

## 5. Conclusão

O Core cobre integralmente a camada de **workflow** (papéis, roteamento, gates, loop-state, journal,
monitor, guardrails): 18 dos 24 itens são aderentes, sendo 6 apenas via adapter. As 3 diferenças
(M-15, M-16, M-18) são inerentes à natureza do Codex como ferramenta externa e ficam endereçadas
pelas obrigações F-04, F-06 e F-09 do contrato (CODX-01). Os 3 itens fora de escopo são
deliberados: o framework não absorve sandbox de vendor, SDK de vendor nem interface de chat.

Nada disso autoriza código: o repositório permanece sem código, pacote ou script Codex (CODX-03).
