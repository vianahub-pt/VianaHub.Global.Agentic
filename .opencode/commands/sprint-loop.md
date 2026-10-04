---
description: Inicia o loop multiagente para uma Sprint específica
agent: sprint-orchestrator
subtask: false
---

## Política obrigatória de idioma no OpenCode Desktop

- Toda comunicação de autoria do agente dirigida ao usuário e visível no OpenCode Desktop deve ser escrita em português do Brasil (`pt-BR`).
- Esta regra aplica-se independentemente do idioma utilizado pelo usuário no prompt.
- Isso inclui mensagens introdutórias, atualizações de progresso, explicações sobre ferramentas, títulos e textos de delegação, avisos, perguntas, resumos, relatórios e respostas finais.
- Produza diretamente em `pt-BR` todas as mensagens e respostas dirigidas ao usuário. O raciocínio ou pensamento visível gerado pelo modelo pode permanecer no idioma nativo do modelo.
- Antes de delegar, instrua cada subagente a manter em `pt-BR` toda comunicação visível dirigida ao usuário.
- Não traduza código, comandos, caminhos, nomes de arquivos, nomes de agentes, nomes de ferramentas ou identificadores técnicos.
- Preserve exatamente os tokens de protocolo, incluindo `INVALID_ORCHESTRATOR_CONTEXT`, `AGENT_ROUTING_REQUIRED`, `INVALID_AGENT_ROUTING`, `AGENT_ROUTING_PASS` e `AGENT_OK:<agente>`.
- Rótulos nativos da interface que não sejam produzidos pelos agentes ficam fora do controle desta política.

# Sprint Loop

Iniciar o loop multiagente para a Sprint especificada.

Este comando aceita exatamente um argumento: o identificador da Sprint no formato `sprint-N`.

Executar como:

```text
/sprint-loop sprint-N
```

Exemplo: `/sprint-loop sprint-2`

## Argumento recebido (interpolação OpenCode `$ARGUMENTS`)

O bloco abaixo é preenchido pelo OpenCode com o valor **real** digitado pelo humano logo após `/sprint-loop`. Não é exemplo, não é esquema e não deve ser deduzido de nenhum outro lugar:

```text
$ARGUMENTS
```

Regras fail-closed para o conteúdo do bloco acima:

1. Bloco **vazio** (nenhum argumento recebido) → retornar `BLOCKED_NEEDS_HUMAN` e parar.
2. **Mais de um valor** (ex.: `sprint-3 extra`) → retornar `BLOCKED_NEEDS_HUMAN` e parar.
3. Valor que não corresponder exatamente ao padrão `sprint-[0-9]+` → retornar `BLOCKED_NEEDS_HUMAN` e parar.
4. Em caso válido, o conteúdo do bloco **é** o sprint-id autoritativo deste comando e alimenta toda a validação e a resolução de arquivos abaixo. É proibido inferir a Sprint pela branch atual, pela listagem de `docs/sprints/` ou por qualquer outra fonte.

## Validação do argumento

O argumento `$ARGUMENTS` **deve** ser validado estritamente:

1. Deve haver exatamente um argumento.
2. O argumento deve corresponder ao padrão `sprint-[0-9]+` (ex.: `sprint-1`, `sprint-2`, `sprint-10`).
3. Se o argumento for inválido, estiver ausente ou contiver mais de um valor, retornar `BLOCKED_NEEDS_HUMAN` com mensagem descritiva e parar.

## Resolução de arquivos

A partir do `$ARGUMENTS` válido, resolver os caminhos:

- **Especificação:** `docs/sprints/<sprint-id>/spec.md`
- **Estado do loop:** `docs/sprints/<sprint-id>/loop-state.md`

Se `spec.md` ou `loop-state.md` não existirem no diretório resolvido, retornar `BLOCKED_NEEDS_HUMAN` com mensagem indicando o arquivo ausente e parar.

## Precondição fail-closed — identidade do orquestrador

Antes de ler qualquer especificação, editar arquivos, executar testes ou delegar, o orquestrador **deve** confirmar que a identidade primária ativa é `sprint-orchestrator`.

Se a identidade ativa não for `sprint-orchestrator` ou não puder ser confirmada, o orquestrador **deve** retornar **apenas** `INVALID_ORCHESTRATOR_CONTEXT` e parar imediatamente.

## Pré-condição fail-closed — roteamento de agentes

Antes de ler especificações da Sprint, editar arquivos, executar testes ou delegar trabalho de Sprint, a sessão atual **deve** conter um `AGENT_ROUTING_PASS` bem-sucedido produzido por `/sprint-loop-check` imediatamente antes de `/sprint-loop`.

Se essa evidência estiver ausente, obsoleta, falhar, vier de outra sessão ou contiver qualquer agente `general` ou delegação não-customizada, o orquestrador **deve** retornar **apenas** `AGENT_ROUTING_REQUIRED` e parar imediatamente sem usar ferramentas ou fazer alterações.

## Contrato operacional de preflight e retomada

- Não use MCPs, plugins ou ferramentas de memória, incluindo `ai-memory_*`.
- Execute cada comando de preflight separadamente. Não encadeie comandos, não use pipes e não combine comandos na mesma chamada de Shell.
- Use exatamente estes comandos:
  1. `git status --short --branch --untracked-files=all`
  2. `git rev-parse HEAD`
  3. `git diff --stat`
- Uma chamada recusada não autoriza variantes improvisadas. Use somente comandos permitidos pelo agente.
- Se `loop-state.md` contiver um checkpoint não terminal compatível com a branch e o SHA-base atuais, retome exatamente do próximo passo registrado.
- Não reinicie uma iteração já registrada e não trate uma alteração válida do próprio `loop-state.md` como trabalho externo inesperado.

## Delegação exata — sem fallback

Delegar **apenas** para os subagentes:

- `sprint-architect`
- `sprint-implementer`
- `sprint-tester`
- `sprint-security`
- `sprint-reviewer`

**Nunca** usar `build`, `general`, `explore`, `scout` ou qualquer outro agente.

Se um subagente exigido não estiver disponível, interromper com `INVALID_AGENT_ROUTING`.

## Arquivos

- Especificação: `docs/sprints/<sprint-id>/spec.md`
- Estado do loop: `docs/sprints/<sprint-id>/loop-state.md`

## Protocolo

O orquestrador deve:

1. Ler `AGENTS.md`, a especificação e o estado do loop
2. Pedir ao arquiteto um plano verificável com uma matriz que cubra todos os critérios de aceitação e os distribua em no máximo cinco ciclos
3. Selecionar somente um incremento pequeno
4. Pedir ao implementador a implementação
5. Pedir ao tester os testes focados
6. Se falharem, devolver ao implementador
7. Quando os testes focados passarem, executar os quality gates completos declarados em `AGENTS.md`
8. Pedir reviews independentes de segurança e código
9. Consolidar findings sem permitir que o implementador os descarte
10. Se existirem findings BLOCKER, HIGH ou MEDIUM, ou qualquer critério de aceitação ainda estiver pendente, iniciar nova iteração
11. Repetir no máximo cinco ciclos
12. Parar com um dos estados:
    - READY_FOR_HUMAN_REVIEW
    - BLOCKED_NEEDS_HUMAN
    - MAX_ITERATIONS_REACHED
    - FAILED_QUALITY_GATES

Somente `READY_FOR_HUMAN_REVIEW` representa sucesso técnico.

## Granularidade autoritativa do checkpoint

Quando `loop-state.md` registrar explicitamente um **Próximo passo permitido**, esse passo é a unidade máxima de trabalho autorizada para a próxima delegação.

Na retomada:

1. Ler o checkpoint mais recente antes de delegar qualquer trabalho.
2. Se existir `Próximo passo permitido`, delegar **somente** esse passo.
3. Critérios, arquivos ou subincrementos posteriores do mesmo ciclo permanecem fora do escopo da delegação atual.
4. É proibido agregar novamente todo o ciclo, todos os arquivos pendentes ou múltiplos subincrementos em uma única delegação quando o checkpoint já os decompôs.
5. A existência parcial de artefatos deve ser inspecionada, mas não autoriza ampliar o escopo além do próximo passo permitido.
6. Concluir e validar o passo atual antes de avançar para o próximo subincremento.
7. Após a validação, persistir em `loop-state.md` o resultado e o próximo passo permitido **antes** da próxima delegação.
8. Uma interrupção, restart ou nova invocação de `/sprint-loop` não remove nem amplia essa restrição.

Exemplo: se o checkpoint registrar `I5a — CODX-01..03` como próximo passo permitido, a próxima delegação pode tratar somente CODX-01..03. REL, DOC, MON e TST posteriores permanecem fora do escopo até que I5a seja validado e o checkpoint avance explicitamente.
## Falhas operacionais de subagentes

Falhas operacionais de uma delegação não contam como novo ciclo funcional da Sprint.

Aplicar este protocolo separadamente a cada passo delegado e registrar cada ocorrência em `loop-state.md` antes de qualquer nova tentativa.

### `EMPTY_RESPONSE`

Quando um subagente retornar resposta vazia ou nenhum resultado utilizável:

1. Na primeira ocorrência do mesmo passo, fazer no máximo **1 retry focado** para o mesmo agente, preservando objetivo, evidências e escopo.
2. O retry deve ser menor e mais específico que a delegação original; não ampliar o escopo.
3. Se o retry também resultar em `EMPTY_RESPONSE`, registrar a segunda ocorrência e parar com `BLOCKED_NEEDS_HUMAN`.
4. É proibido criar uma terceira delegação para contornar duas respostas vazias do mesmo passo.

### `STEP_LIMIT`

Quando um subagente atingir o limite de steps antes de concluir:

1. Inspecionar o resultado retornado e o working tree para determinar se existe progresso verificável.
2. Se houver progresso verificável, fazer no máximo **1 continuação focada**, limitada ao trabalho restante e à validação necessária.
3. Se não houver progresso verificável, fazer no máximo **1 retry decomposto**, reduzindo o escopo da delegação.
4. Se a continuação ou retry também terminar por `STEP_LIMIT`, registrar a segunda ocorrência e parar com `BLOCKED_NEEDS_HUMAN`.
5. É proibido reiniciar silenciosamente o mesmo trabalho ou encadear novos subagentes para escapar do limite.

### Persistência e retomada

Para cada `EMPTY_RESPONSE` ou `STEP_LIMIT`, registrar em `loop-state.md`, no mínimo:

- agente;
- passo/incremento;
- motivo (`EMPTY_RESPONSE` ou `STEP_LIMIT`);
- número da tentativa operacional;
- ação tomada (`focused-retry`, `focused-continuation` ou `decomposed-retry`);
- resultado.

Os contadores de tentativa operacional pertencem ao checkpoint. Reiniciar OpenCode, Desktop ou sessão não os zera.

Uma retomada deve respeitar o contador persistido e continuar do próximo passo operacional permitido, sem repetir uma tentativa já registrada.
## Ausência de test runner

Se o tester reportar `NO_TEST_RUNNER_DECLARED`:

1. Nunca contar como PASS
2. Registrar o fato em `loop-state.md`
3. Parar com `BLOCKED_NEEDS_HUMAN`

`AGENTS.md` só muda por edição humana; não devolver ao implementador com a expectativa de que ele declare o runner sozinho.

## FINAL_REMEDIATION

Se após o ciclo 5 todos os acceptance criteria estiverem concluídos e todos os quality gates estiverem PASS, mas ainda existirem findings BLOCKER, HIGH ou MEDIUM, o orquestrador deve entrar em modo FINAL_REMEDIATION:

1. **Máximo de 2 rounds** de FINAL_REMEDIATION
2. **Não criar Ciclo 6** — o trabalho continua como extensão do ciclo 5
3. **Architect classifica tecnicamente** os findings:
   - Obrigatório: viola critério de aceitação, segurança ou acordos de design
   - Excessivo: melhoria de manutenibilidade, estilo, convenção — não viola requisitos
4. **Não permitir downgrade artificial** de findings OBRIGATÓRIOS para EXCESSIVOS
5. **Implementer corrige** apenas findings classificados como OBRIGATÓRIOS
6. **Tester executa** todos os quality gates declarados em `AGENTS.md`, na ordem declarada
7. **Security e Reviewer reavaliam** o diff acumulado completo
8. **Somente 0 BLOCKER/HIGH/MEDIUM** permite READY_FOR_HUMAN_REVIEW

### Restrições da FINAL_REMEDIATION

- O Implementer não pode corrigir findings classificados como EXCESSIVOS
- O Architect não pode reclassificar findings OBRIGATÓRIOS como EXCESSIVOS após o início da correção
- **A classificação do Architect NÃO elimina nem reduz por si só a severidade de um finding**
- Um finding HIGH/MEDIUM classificado pelo Architect como excessivo continua ativo até que sprint-security e/ou sprint-reviewer, conforme sua origem, o reavaliem no diff acumulado e:
  - confirmem sua resolução; ou
  - reclassifiquem sua severidade com justificativa técnica
- **READY_FOR_HUMAN_REVIEW continua exigindo resultado FINAL dos reviewers com 0 BLOCKER, 0 HIGH e 0 MEDIUM**
- Cada round de FINAL_REMEDIATION deve ser documentado no loop-state.md
- Se após 2 rounds ainda houver BLOCKER/HIGH/MEDIUM, retornar MAX_ITERATIONS_REACHED

## Gate obrigatório de cobertura e conclusão

- A aprovação de um incremento pequeno nunca representa, isoladamente, a conclusão da Sprint.
- O plano do arquiteto deve conter uma matriz verificável que relacione todos os critérios de aceitação da especificação aos incrementos planejados, sem omissões, e os distribua em no máximo cinco ciclos.
- Nenhum critério pode ser inferido como concluído apenas porque os testes do incremento atual passaram.
- Depois de cada ciclo, qualquer critério pendente exige uma nova iteração, mesmo quando não existirem findings `BLOCKER`, `HIGH` ou `MEDIUM`.
- Alterações válidas preexistentes no working tree devem ser inspecionadas e retomadas como trabalho parcial. Elas não podem ser descartadas, sobrescritas cegamente nem tratadas automaticamente como Sprint concluída.
- No gate final, `sprint-tester`, `sprint-security` e `sprint-reviewer` devem avaliar o diff acumulado e toda a especificação, não apenas o último incremento.

### Atualização obrigatória do loop-state

Antes da primeira delegação de trabalho da Sprint, atualizar `loop-state.md` da Sprint especificada com:

- branch;
- SHA-base;
- status;
- iteração atual.

A primeira delegação de trabalho deve ser para `sprint-architect`. Imediatamente após o retorno do arquiteto e antes de delegar ao implementador, registrar no `loop-state.md` a matriz completa dos critérios de aceitação e sua distribuição entre os ciclos.

Após cada ciclo, atualizar obrigatoriamente `loop-state.md` com:

- número da iteração;
- incremento executado;
- critérios concluídos e critérios pendentes;
- arquivos alterados;
- testes focados e gates completos executados;
- findings;
- decisões;
- bloqueios;
- próximo passo.

Antes de retornar qualquer estado terminal, registrar no `loop-state.md` o estado de parada e todas as evidências que o sustentam.

Se o estado registrado contradisser o working tree, a especificação ou as evidências produzidas pelos agentes, parar com `BLOCKED_NEEDS_HUMAN`.

### Condições exclusivas para sucesso

`READY_FOR_HUMAN_REVIEW` somente pode ser retornado quando todas as condições abaixo forem verdadeiras:

1. Todos os critérios de aceitação da especificação foram implementados.
2. Cada critério possui evidência objetiva de verificação.
3. Todos os testes focados e gates completos passaram.
4. Toda documentação exigida pela especificação foi concluída.
5. Não existem findings `BLOCKER`, `HIGH` ou `MEDIUM`.
6. O `loop-state.md` registra integralmente o resultado e suas evidências.

Se qualquer critério permanecer pendente após o quinto ciclo, retornar `MAX_ITERATIONS_REACHED`, nunca `READY_FOR_HUMAN_REVIEW`.

### Tratamento de falhas de gate de formatação

Quando o gate de formatação declarado em `AGENTS.md` falhar:

1. **O ciclo permanece incompleto/IN_PROGRESS** — falha de formatação não é finding BLOCKER
2. **Redelegar formatação ao Implementer** com as seguintes restrições:
   - Conceder apenas permissão para executar o comando de formatação declarado na `AGENTS.md` nos arquivos que o Implementer já pode editar (conforme seu escopo de edição)
   - **Não conceder** shell genérico, `npm *` ou `npx *` ilimitados
   - A permissão deve ser específica para os arquivos alterados no ciclo atual
3. **Não alterar configuração de line endings** — se o repositório ganhar um `.gitattributes`, essa configuração só muda por decisão humana
4. **Após correção**, reexecutar o mesmo gate para validar
5. **Somente continuar após PASS** — o ciclo só pode ser concluído com o gate de formatação aprovado
6. Se não puder ser corrigido dentro das permissões/execução disponível, usar `FAILED_QUALITY_GATES` ou `BLOCKED_NEEDS_HUMAN` quando realmente exigir intervenção humana

## Restrições

- Nunca usar auto-merge
- Nunca criar commit
- Nunca fazer push
- Nunca acessar infraestrutura externa
- Nunca alterar `AGENTS.md`, `opencode.json`, `.opencode/**` ou `.github/**`
- Interromper em condições de parada humana
