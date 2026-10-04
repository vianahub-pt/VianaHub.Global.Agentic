# VianaHub.Global.Agentic

Framework de engenharia agentic vendor-neutral da VianaHub: orquestração de sprints, loops de desenvolvimento, guardrails, memória, journaling, testes, segurança e revisão.

## Estado atual

- **Sprint 0** — fundação do framework (Agentic Core, contratos de papéis, protocolos de loop/estado/journal, guardrails, quality gates, perfis de stack, adapters, Sprint Monitor).
- **Sem uso em produção.** O framework está em fase de construção e validação.
- **Interface oficial:** OpenCode Desktop para execução do loop de Sprint.

## Arquitetura

- **Core** (`src/core/`) — O QUE: tipos de domínio, máquina de estados, portas, guardrails, gates (intenção).
- **Adapter** (`src/adapters/`) — COMO: roteamento, agentes, tokens por ferramenta de IA.
- **Profile** (`src/profile/`) — COMO verificar: comandos de gates por stack.

Regra de dependência: `adapter -> core` e `profile -> core`; nunca o inverso.

## Quality Gates

8 gates declarados em `AGENTS.md`: whitespace, format, lint, typecheck, test, coverage, build, audit.

## Documentação

- [Arquitetura](docs/architecture/arquitetura.md)
- [Perfis](docs/architecture/perfis.md)
- [Guia: como escrever um adapter](docs/guides/como-escrever-adapter.md)
- [Guia: como escrever um profile](docs/guides/como-escrever-profile.md)
- [Versionamento](docs/versionamento.md)
- [Changelog](CHANGELOG.md)
- [ADRs](docs/adr/)
