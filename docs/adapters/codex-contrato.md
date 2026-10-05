# Contrato do adapter Codex (CODX-01)

| Campo | Valor |
| --- | --- |
| ID | CODX-01 |
| Artefato | `docs/adapters/codex-contrato.md` |
| Status | Normativo para implementação futura (design-only na Sprint 0) |
| Escopo | Contrato exigido do adapter Codex, que herda a porta `AgenticAdapter` do Core |

## 1. Propósito

Este documento define o contrato que o adapter **Codex** (ferramenta de IA coding da OpenAI Codex)
deve satisfazer para integrar-se ao VianaHub Global Agentic. O adapter Codex é uma implementação
**vendor-specific** da porta vendor-neutral `AgenticAdapter`, definida em `src/core/ports.ts`.

> **Estado atual do repositório:** o adapter Codex **não está implementado** e **não deve existir**
> em código, pacote ou script (ver `test/codex-absence.test.ts`, CODX-03). Documentar o contrato é
> exigência de design da Sprint 0 (`docs/sprints/sprint-0/spec.md`, seção "Codex como adapter
> futuro"); não autoriza implementação. A implementação futura depende de decisão humana explícita.

## 2. Princípios herdados do Core

1. **Core define O QUE; adapter define COMO.** Nenhum tipo, contrato ou regra do Core menciona um
   vendor; toda particularidade do Codex vive no adapter.
2. **Portas antes de implementações.** O Codex implementa a porta; não a estende de forma que exija
   mudanças no Core (regra de dependência: `adapter -> core`, nunca o inverso).
3. **Deny-by-default.** Permissões, ferramentas, caminhos e rede são negados por padrão e concedidos
   apenas por allow-list explícita vinda dos contratos de papel (`src/core/roles.ts`) e do profile.
4. **Fail-closed.** Estado desconhecido, credencial ausente, roteamento inválido ou gate
   indisponível resultam em erro tipado ou estado de parada — nunca em avanço ou sucesso silencioso.
5. **Tokens de protocolo byte a byte** (`src/core/tokens.ts`): o adapter Codex emite exatamente os
   mesmos tokens que qualquer outro adapter.

## 3. Herança do contrato

O adapter Codex **herda a porta `AgenticAdapter`** (em TypeScript, `implements AgenticAdapter`) e
implementa as sete operações do contrato base, sem restringir nem especializar a semântica de
qualquer uma delas:

```ts
// Fonte de verdade: src/core/ports.ts (trecho reproduzido para conveniência).
export type RoutingStatus = 'AGENT_ROUTING_PASS' | 'AGENT_ROUTING_REQUIRED' | 'INVALID_AGENT_ROUTING';

export interface AgenticAdapter {
  identifyRoles(): readonly Role[];
  applyRouting(roles: readonly Role[]): void;
  reportRoutingStatus(): RoutingStatus;
  resolveGate(gateId: GateId, profile: StackProfile): GateResolution;
  serializeLoopState(state: LoopState): string;
  deserializeLoopState(serialized: string): LoopState;
  emit(event: MonitorEvent): void;
}

export class CodexAdapter implements AgenticAdapter {
  // implementação vendor-specific, isolada em src/adapters/codex/
}
```

Regras de herança:

- Nenhum membro de `CodexAdapter` altera a semântica das operações do Core.
- Extensões específicas do Codex (mapeamento de comandos, credenciais, flags de sandbox) ficam
  **dentro** do adapter, nunca na porta.
- O Core continua compilando e testando sem o adapter Codex (teste de dependência: `CORE-10`/`ADP-07`).
- O adapter Codex pode ser removido sem tocar em `src/core/**`, `src/profile/**` ou `src/monitor/**`.

## 4. Obrigações por operação do contrato

| Operação | Obrigação no adapter Codex |
| --- | --- |
| `identifyRoles()` | Retorna os **6 IDs canônicos** de `ROLES` (`src/core/types.ts`), imutáveis. O Codex não possui papéis nativos equivalentes: o adapter declara o binding papel -> subagente Codex (por exemplo, um subagente por papel) preservando `mode`, `editScope`, `permissions` e `readOnly` de `ROLE_CONTRACTS`. |
| `applyRouting(roles)` | Resolve o roteamento de forma **fail-closed**: lista vazia -> `AGENT_ROUTING_REQUIRED`; papel desconhecido -> `INVALID_AGENT_ROUTING`; somente a delegação exata dos 5 subagentes (`EXACT_DELEGATION`) com os papéis válidos -> `AGENT_ROUTING_PASS`. **Sem fallback** para qualquer agente substituto. |
| `reportRoutingStatus()` | Devolve o `RoutingStatus` resultante da última chamada de `applyRouting`; estado inicial `AGENT_ROUTING_REQUIRED`. |
| `resolveGate(gateId, profile)` | Nunca embute comando de gate: delega ao Core (`resolveGate(getGate(gateId), profile)`) e devolve `GateResolution` (`RESOLVED` com comando não-vazio ou `UNAVAILABLE` fail-closed). O Codex não possui toolchain de gates própria; os comandos vêm do `StackProfile` do projeto consumidor. |
| `serializeLoopState(state)` | Serializa o `LoopState` (JSON) validando com `isLoopState`; estado desconhecido -> erro tipado (`UnknownStateError`), nunca serialização silenciosa. |
| `deserializeLoopState(serialized)` | Desserializa com validação fail-closed: JSON inválido ou não-estado -> `DomainError('LOOP_STATE_INVALID', ...)`; estado textual desconhecido -> `UnknownStateError`. |
| `emit(event)` | Encaminha o `MonitorEvent` ao `Monitor` injetado. A tradução de vocabulário Codex (turnos, tool calls, uso de tokens) para o formato vendor-neutral é responsabilidade do adapter; o formato do evento nunca menciona o vendor. |

## 5. Obrigações específicas do vendor Codex

| # | Obrigação | Exigência |
| --- | --- | --- |
| F-01 | Identificação | `id = 'codex'`, `vendor = 'openai-codex'`, imutáveis após construção. |
| F-02 | Delegação exata | As 5 sondagens de roteamento seguem o contrato `ROUTING_PROBE_CONTRACT` (prefixo `ROUTING_PROBE_ONLY`, zero ferramentas, resposta somente `AGENT_OK:<agente>`); o adapter Codex produz os mesmos tokens do adapter OpenCode. |
| F-03 | Configuração declarativa | Configuração validada na construção/inicialização: comando/binário ou endpoint, modelo, timeouts, permissões efetivas, diretório de trabalho e política de rede. Mudança de política exige novo ciclo de inicialização (auditoria). |
| F-04 | Credenciais | Vindas de variáveis de ambiente ou provedor humano (ex.: `OPENAI_API_KEY`); ausentes -> erro `MISSING_CREDENTIALS` (fail-closed). **Nenhum segredo em repositório.** |
| F-05 | Redação de segredos | Chaves, tokens e trechos autenticados nunca aparecem em logs, eventos, métricas, resultados ou mensagens de erro: redação obrigatória na fronteira do adapter (`src/core/redact.ts`). |
| F-06 | Modo de execução | Simulado/real **declarado** em configuração. Sem autorização humana explícita, nenhuma chamada a infraestrutura externa ocorre durante o loop de Sprint (GUARD-05). |
| F-07 | Sandbox e permissões | Espelha deny-by-default: filesystem, rede, sub-processos e ferramentas do Codex só por allow-list explícita; qualquer capacidade não concedida é negada em runtime. |
| F-08 | Sem fallback silencioso | Indisponibilidade do Codex (binário ausente, endpoint inacessível, credencial inválida) nunca degrada para outro adapter nem vira sucesso: erro `VENDOR_UNAVAILABLE` ou parada `BLOCKED_NEEDS_HUMAN`. |
| F-09 | Timeout e cancelamento | Toda operação aplica timeout explícito configurável (`TIMEOUT`) e respeita cancelamento cooperativo; processos filhos do Codex são encerrados limpos (sem processo órfão). |
| F-10 | Validação de entrada | Prompts, caminhos e argumentos de ferramentas validados contra path traversal e injeção de argumentos antes de qualquer execução de processo (mesma postura de `src/core/guards.ts`). |

## 6. Taxonomia de erros do adapter

Códigos estáveis, semântica estável, causa original preservada (sem segredos):

| Código | Quando |
| --- | --- |
| `MISSING_CREDENTIALS` | Credencial do Codex ausente ou ilegível. |
| `INVALID_CONFIG` | Configuração inválida ou incompleta. |
| `CAPABILITY_NOT_DECLARED` | Runtime tenta usar capacidade não declarada. |
| `TIMEOUT` | Estouro de timeout configurado. |
| `CANCELLED` | Cancelamento solicitado pelo orquestrador. |
| `VENDOR_UNAVAILABLE` | Codex indisponível (binário, endpoint, rede bloqueada). |
| `EXECUTION_FAILED` | Falha reportada pelo Codex, com diagnóstico redigido preservado. |
| `ADAPTER_DISPOSED` | Uso do adapter após descarte. |

Regras: erros são normalizados para a taxonomia acima (desconhecido -> `EXECUTION_FAILED`);
nunca são engolidos por `catch` (CORE-12); mensagens passam por `redact()` antes de qualquer efeito
colateral observável.

## 7. Obrigações de observabilidade

- O adapter **emite**; o Core/Monitor decide o destino (sink de arquivo append-only dentro do
  workspace ou sink em memória). O adapter nunca escreve em banco, canal remoto ou fora do workspace.
- Eventos carregam a correlação obrigatória de `MonitorEvent` (`sprintId`, `cycle`, `iteration`,
  `phase`, `role`, `branch`, `shaBase`, `timestamp`, `schemaVersion`) — ver MON-03.
- Vocabulário vendor (turnos, tool calls, consumo de tokens do Codex) é traduzido no adapter; o
  formato do evento permanece vendor-neutral (MON-06).

## 8. Obrigações de teste

Quando (e se) implementado por decisão humana, o adapter Codex exige testes em `test/**/*.test.ts`
cobrindo, no mínimo: as sete operações da porta; cada código de erro da seção 6; delegação exata sem
fallback; redação de segredos; e modo simulado determinístico. **Nenhum teste do repositório pode
depender de rede, credencial ou vendor real** (TST-05). A ausência de código Codex neste repositório
continua garantida por `test/codex-absence.test.ts` até que uma decisão humana autorize a
implementação e atualize esse teste.

## 9. Critérios de aceite do contrato

- CODX-01.1 — `CodexAdapter` herda `AgenticAdapter` sem exigir mudanças no Core.
- CODX-01.2 — As sete operações da porta seguem exatamente a semântica fail-closed da seção 4.
- CODX-01.3 — As obrigações F-01..F-10 são verificáveis por teste.
- CODX-01.4 — Taxonomia da seção 6 íntegra, sem colisão de códigos.
- CODX-01.5 — Nenhum segredo, tipo ou SDK do Codex aparece fora do adapter; este documento permanece
  vigente mesmo com o repositório sem código Codex (estado atual, por decisão de arquitetura).
