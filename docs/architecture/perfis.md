# Perfis de Stack

> **Status:** documento de arquitetura. O perfil `node-typescript` está implementado em
> `src/profile/node-typescript.profile.ts`; os perfis citados como "futuros" são extensão
> planejada e ainda não existem no código.

## O que é um perfil

Um perfil de stack (`StackProfile`, ver `src/core/ports.ts`) é **dado declarativo**, sem lógica
imperativa: ele mapeia cada gate do catálogo (`GATE_CATALOG`, em `src/core/gates.ts`) para o
comando concreto da toolchain da stack.

Regras:

- O Core define **o que** deve ser verificado (intenção do gate); o perfil define **como** (comando).
- Um gate sem mapeamento nunca produz comando vazio: a resolução é `UNAVAILABLE` (fail-closed),
  conforme `resolveGate` em `src/core/gates.ts`.
- O perfil é serializável e imutável (`Object.freeze`), permitindo validação e auditoria.
- A injeção de um perfil alternativo substitui os comandos sem alterar o Core: a resolução é uma
  função pura de `(gate, profile)`.

## Perfil atual

### `nodeTypescriptProfile` (Node.js + TypeScript)

| Gate        | Comando                    |
| ----------- | -------------------------- |
| `whitespace`  | `git diff --check`           |
| `format`      | `npm run format:check`       |
| `lint`        | `npm run lint`               |
| `typecheck`   | `npm run typecheck`          |
| `test`        | `npm test`                   |
| `coverage`    | `npm run test:coverage`      |
| `build`       | `npm run build`              |
| `audit`       | `npm run audit`              |

Fonte de verdade dos gates: seção *Quality Gates* de `AGENTS.md`.

## Extensões futuras

Perfis adicionais são **extensão futura** deste framework vendor-neutral. Nenhum deles está
implementado ou autorizado hoje; a adoção depende de decisão humana explícita, refletida em
`AGENTS.md` e na spec da Sprint correspondente.

### Perfil Python (futuro)

Candidato de mapeamento para uma toolchain Python (ex.: `uv`/`pip`, `ruff`, `mypy`, `pytest`,
`coverage.py`):

| Gate        | Comando candidato (ilustrativo) |
| ----------- | ------------------------------- |
| `whitespace`  | `git diff --check`                |
| `format`      | `ruff format --check`             |
| `lint`        | `ruff check`                      |
| `typecheck`   | `mypy .`                          |
| `test`        | `pytest`                          |
| `coverage`    | `pytest --cov`                    |
| `build`       | `python -m build`                 |
| `audit`       | `pip-audit`                       |

Os comandos acima são **ilustrativos**: a escolha final da toolchain Python será validada por
humano antes de qualquer implementação.

### Perfil Go (futuro)

Candidato de mapeamento para uma toolchain Go (ex.: `go vet`, `gofmt`, `golangci-lint`,
`go test`, `govulncheck`):

| Gate        | Comando candidato (ilustrativo) |
| ----------- | ------------------------------- |
| `whitespace`  | `git diff --check`                |
| `format`      | `gofmt -l .`                      |
| `lint`        | `golangci-lint run`               |
| `typecheck`   | `go vet ./...`                    |
| `test`        | `go test ./...`                   |
| `coverage`    | `go test -cover ./...`            |
| `build`       | `go build ./...`                  |
| `audit`       | `govulncheck ./...`               |

Mesma ressalva: comandos ilustrativos, sujeitos a validação humana.

## Princípio de extensão

Novos perfis devem:

1. ser apenas dados declarativos (serializáveis, `Object.freeze`, sem funções);
2. cobrir todos os gates do catálogo ou aceitar `UNAVAILABLE` explícito nos gates não suportados;
3. ser injetáveis via `StackProfile` sem qualquer mudança no Core;
4. ter seus comandos validados contra a documentação de qualidade gates da stack alvo.
