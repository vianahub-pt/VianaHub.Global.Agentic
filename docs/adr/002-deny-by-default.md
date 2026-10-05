# ADR-002: Deny-by-Default

## Status
Aceito

## Contexto
Agentes de Sprint não devem ter permissões além do necessário.

## Decisão
Todas as permissões são negadas por padrão (`denyByDefault: true`). Allow-lists explícitas por papel.

## Consequências
- Nenhum acesso não intencional a arquivos, comandos ou rede.
- Guardrails protegidos mecanicamente (path traversal negado, segredos negados).
