---
description: Executa follow-up controlado pós-commit decorrente de revisão de PR. Não é retomada LOOP-06.
agent: sprint-orchestrator
subtask: false
---

# PR Review Follow-Up

Execute exclusivamente um `PR_REVIEW_FOLLOW_UP` pós-commit previamente autorizado no `loop-state.md`.

Este comando não representa retomada de checkpoint `LOOP-06`, não cria novo ciclo e não cria `FINAL_REMEDIATION`.

## Argumento recebido (interpolação OpenCode `$ARGUMENTS`)

Este comando aceita exatamente um argumento: o identificador da Sprint no formato `sprint-N`.

Executar como:

```text
/pr-review-follow-up sprint-N
```
O bloco abaixo é preenchido pelo OpenCode com o valor real digitado pelo humano após `/pr-review-follow-up`:

```text
$ARGUMENTS
```

Regras fail-closed:

1. Bloco vazio → retornar `BLOCKED_NEEDS_HUMAN` e parar.
2. Mais de um valor → retornar `BLOCKED_NEEDS_HUMAN` e parar.
3. Valor que não corresponda exatamente ao padrão `sprint-[0-9]+` → retornar `BLOCKED_NEEDS_HUMAN` e parar.
4. Em caso válido, o valor recebido é o `sprint-id` autoritativo. É proibido inferir a Sprint pela branch, pelo conteúdo de `docs/sprints/` ou por qualquer outra fonte.

A partir do `sprint-id` válido, resolver:

- `docs/sprints/<sprint-id>/spec.md`
- `docs/sprints/<sprint-id>/loop-state.md`

Se qualquer um dos dois arquivos não existir, retornar `BLOCKED_NEEDS_HUMAN` e parar.

## Pré-condição de roteamento

Exija `AGENT_ROUTING_PASS` obtido imediatamente antes deste comando, na mesma sessão.

Se a condição não estiver satisfeita, retorne somente:

`AGENT_ROUTING_REQUIRED`

## Preflight fail-closed

Antes de qualquer delegação:

1. Leia o `spec.md` e o `loop-state.md` resolvidos a partir do `sprint-id` validado.
2. Execute somente:
   - `git status --short --branch --untracked-files=all`
   - `git rev-parse HEAD`
   - `git diff --stat`
3. Confirme no `loop-state.md`:
   - status `PR_REVIEW_FOLLOW_UP`;
   - decisão humana explícita de boundary pós-commit;
   - branch autorizada;
   - Follow-up HEAD autorizado;
   - escopo PRF explicitamente autorizado.
4. Compare:
   - branch atual com branch autorizada;
   - HEAD atual com Follow-up HEAD autorizado.

O `SHA-base` histórico da Sprint não deve ser comparado com o HEAD atual neste comando e não deve ser alterado. Ele continua sendo a proveniência da execução original.

Se qualquer pré-condição falhar, retorne `BLOCKED_NEEDS_HUMAN` e registre a evidência no `loop-state.md`.

## Working tree preexistente

Alterações preexistentes somente são aceitáveis quando estiverem explicitamente reconhecidas pela decisão humana registrada no `loop-state.md`.

Não reverta, reescreva nem absorva silenciosamente alterações humanas preexistentes.

Qualquer alteração não reconhecida exige `BLOCKED_NEEDS_HUMAN`.

## Execução

Execute estritamente nesta ordem:

1. `sprint-architect`
   - analisar exclusivamente o escopo PRF registrado;
   - produzir plano verificável;
   - não ampliar escopo.

2. `sprint-implementer`
   - implementar exclusivamente os itens PRF autorizados;
   - respeitar integralmente `permission.edit`;
   - não alterar Core, especificação da Sprint ou guardrails;
   - não fazer commit, push, merge ou acesso externo.

3. `sprint-tester`
   - executar validações focadas requeridas pelo PRF;
   - executar os quality gates aplicáveis;
   - registrar comandos, exit codes e resultados.

4. `sprint-security`
   - revisar exclusivamente o incremento do follow-up e seus efeitos;
   - classificar findings.

5. `sprint-reviewer`
   - revisar escopo, arquitetura, manutenção, testes e compatibilidade do incremento.

Não substitua nenhum desses agentes pelo próprio Orchestrator.

## Findings

Se Tester, Security ou Reviewer encontrarem problema que exija alteração:

- não iniciar novo ciclo;
- não entrar em `FINAL_REMEDIATION`;
- registrar o finding;
- retornar `BLOCKED_NEEDS_HUMAN`.

Este comando não possui loop autônomo de remediation.

## Conclusão

Somente retornar `READY_FOR_HUMAN_REVIEW` quando:

- todos os PRFs autorizados estiverem concluídos;
- validações obrigatórias estiverem PASS;
- quality gates aplicáveis estiverem PASS;
- Security tiver 0 BLOCKER/HIGH/MEDIUM;
- Reviewer tiver 0 BLOCKER/HIGH/MEDIUM;
- não houver expansão de escopo;
- não tiver ocorrido commit, push ou merge.

Registre no `loop-state.md`:

- Follow-up HEAD;
- agentes executados;
- implementação realizada;
- validações e exit codes;
- findings;
- resultado final.

Qualquer outra condição deve terminar fail-closed.
