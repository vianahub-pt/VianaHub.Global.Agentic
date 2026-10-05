# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento por [SemVer](https://semver.org/lang/pt-BR/).

## [0.0.0] - Não publicado

### Adicionado
- Agentic Core vendor-neutral: tipos de domínio, máquina de estados, portas, erros tipados (CORE-01..12).
- Contratos dos 6 papéis canônicos com permissões deny-by-default (ROLE-01..08).
- Protocolos de loop, estado, journal e guardrails (LOOP-01..10, GUARD-01..08).
- Abstração de quality gates (8 gates genéricos) com StackProfile Node.js/TypeScript (GATE-01..09, PROF-01..06).
- Sprint Monitor: eventos versionados, sinks (memória/arquivo), métricas derivadas (MON-01..09).
- Adapter OpenCode: mapeamento de papéis, validação de roteamento, geração de propostas (ADP-01..09).
- Adapter falso em memória para testes sem vendor (ADP-06).
- Design do adapter Codex: contrato e matriz de aderência (CODX-01..03).
- Migração bootstrap → framework: inventário, paridade, anti-migração (MIG-01..07).

### Regra de mudanças quebradoras
Toda mudança quebradora exige nota de migração nesta seção, com passos claros de atualização para consumidores (REL-04).
