# Exclusão do domínio Marketing.Ops (GUARD-06)

- Sprint: `sprint-0`
- Critérios: `GUARD-06` (este checklist), com verificação mecanizada em `GUARD-07` e `MIG-07`
- Espelho: seção "Não-objetivos (fora de escopo da Sprint 0)" de `docs/sprints/sprint-0/spec.md`
- Verificação automatizada: `test/anti-migration.test.ts`

## Princípio

A Sprint 0 **não pode** copiar, migrar, reimplementar nem referenciar como dependência os
componentes de negócio do Marketing.Ops. O único insumo autorizado do workflow de referência
(`VianaHub.Global.Marketing.Ops`) foi a inspeção do workflow `.opencode` / `AGENTS.md` /
`docs/sprints/*`; o aplicativo `automation/` desse repositório **nunca** entrou neste framework.

A exclusão não é prosa: ela é verificada de forma mecanizada. Nenhum caminho, import ou script do
domínio proibido pode existir em `src/**`, `test/**` ou `package.json` (varredura em
`test/anti-migration.test.ts`, fail-closed).

## Checklist de exclusão — migração proibida de domínio

Espelho literal dos itens da subseção "Migração proibida de domínio do Marketing.Ops" dos
Não-objetivos da spec. Cada item está **excluído** do repositório do framework.

| #  | Item excluído                                                                 | Verificação da exclusão                                                              |
| -- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1  | Orquestrador de automação de marketing (marketing automation orchestrator)    | Varredura (`automation/`); nenhuma implementação equivalente em `src/**`              |
| 2  | Integrações Google Business Profile                                           | Varredura (`GBP`); nenhum SDK/cliente de plataforma em `src/**` ou `package.json`     |
| 3  | Schedules/cron de marketing                                                   | Nenhum scheduler/cron no framework; varredura de conteúdo; `GUARD-05` (sem externo)   |
| 4  | Persistência SQL do Marketing.Ops (migrations, `database/`, `opsdb`, `sqlcmd`)| Varredura (`database/`, `opsdb`, `sqlcmd`); zero dependências de banco em `package.json` |
| 5  | Lógica de recuperação de domínio (domain recovery)                            | Nenhuma implementação equivalente; revisão de diff                                   |
| 6  | Diretórios `automation/`, `brands/`, `data/`, `reports/`, `database/`         | Varredura de caminhos e de conteúdo (os 5 padrões de diretório)                      |
| 7  | Marcas, mercados, GERIT (`brands/gerit/`, `reports/gerit/`)                   | Varredura (`brands/`, `reports/`, `gerit`); nenhum conceito de marca/mercado em `src/**` |
| 8  | `.env`, credenciais, tokens de plataforma, VPS, CAPTCHA/MFA/rate limits de terceiros | Leituras negadas por padrão (`SECRET_PATH_PATTERNS` em `src/core/guards.ts` e `opencode.json`); `GUARD-05` nega infraestrutura externa; nenhuma credencial no repositório |

- [x] 1 — Orquestrador de automação de marketing: excluído (sem código, import ou script).
- [x] 2 — Integrações Google Business Profile: excluídas (sem SDK, cliente ou configuração).
- [x] 3 — Schedules/cron de marketing: excluídos (nenhum agendador no framework).
- [x] 4 — Persistência SQL do Marketing.Ops: excluída (sem migrations, sem cliente SQL, sem scripts de banco).
- [x] 5 — Domain recovery do Marketing.Ops: excluído.
- [x] 6 — Diretórios proibidos: excluídos (nenhum existe nem é referenciado).
- [x] 7 — Marcas, mercados e GERIT: excluídos (nenhum dado de marca/mercado migrado).
- [x] 8 — Segredos, VPS e controles de terceiros: excluídos (deny-by-default + redação obrigatória).

## Padrões proibidos (unidade da varredura automatizada)

Os padrões abaixo são a tradução executável do checklist. A comparação é case-insensitive e vale
para caminhos, imports, scripts e conteúdo em `src/**`, `test/**` e `package.json`.

| Padrão     | Espelha o item | Exemplo de violação                          |
| ---------- | -------------- | -------------------------------------------- |
| `automation/` | 1, 6         | `src/automation/orchestrator.ts`             |
| `brands/`  | 6, 7           | `brands/gerit/market.json`                   |
| `data/`    | 6              | `data/seed.json`, `fixtures data/seed.json`  |
| `reports/` | 6, 7           | `reports/gerit/build.mjs`                    |
| `database/`| 4, 6           | `migrations/database/001.sql`                |
| `opsdb`    | 4              | `Server=localhost;Database=opsdb`            |
| `sqlcmd`   | 4              | `sqlcmd -S localhost -d opsdb`               |
| `gerit`    | 7              | `reports/GERIT/resumo.md`                    |
| `GBP`      | 2              | `integração GBP (Google Business Profile)`   |

Observação: esta documentação cita os padrões proibidos por definição e por isso fica fora do
escopo da varredura (que cobre somente `src/**`, `test/**` e `package.json`). O próprio
`test/anti-migration.test.ts` declara os padrões e é a única exclusão da checagem de conteúdo —
exclusão por caminho exato, com o caminho continuando verificado.

## Demais não-objetivos (espelho da spec)

Fora do domínio Marketing.Ops, mas igualmente fora de escopo da Sprint 0:

- [x] Implementar o adapter Codex (apenas design; `CODX-03` proíbe código/pacote/script).
- [x] Implementar perfis além do mínimo exigido por `PROF-02`.
- [x] Publicar release, tag, pacote ou CHANGELOG público (apenas preparar o versionamento).
- [x] Configurar CI/CD, GitHub Actions, CodeQL ou Dependabot (decisão humana).
- [x] Alterar `develop`, `main` ou qualquer branch além desta.
- [x] Commit, push, merge ou PR (sem operações Git remotas no loop).
- [x] Integração com banco de dados, API HTTP, frontend, scheduler ou infraestrutura externa.
- [x] Abstrações especulativas sem consumidor no Sprint 0.

## Como a exclusão é verificada

1. **Automatizada (obrigatória):** `test/anti-migration.test.ts` varre `src/**`, `test/**` e
   `package.json` — caminhos de arquivo, imports, scripts/dependências de `package.json` e
   conteúdo — e reprova qualquer ocorrência dos padrões proibidos. Escopo vazio ou ausente também
   reprova (fail-closed): varredura vazia nunca é evidência de exclusão.
2. **Manual (difícil):** revisão de diff em cada ciclo; qualquer material do Marketing.Ops que
   apareça em proposta de mudança é rejeitado.
3. **Fronteira humana:** a necessidade real de qualquer componente do Marketing.Ops encerra o
   trabalho com `BLOCKED_NEEDS_HUMAN`. Nada é copiado "como referência de implementação".

## Critérios cobertos

- `GUARD-06` — Checklist de exclusão do domínio Marketing.Ops publicado em documentação.
- Apoio direto a `GUARD-07` (varredura automatizada) e `MIG-07` (nenhuma dependência do
  Marketing.Ops criada pela migração).
