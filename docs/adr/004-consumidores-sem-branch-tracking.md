# ADR-004: Consumidores sem Branch Tracking

## Status
Aceito

## Contexto
Consumidores do framework não devem depender de branches instáveis.

## Decisão
Consumidores dependem de versão publicada (SemVer + tags imutáveis). Upgrade é explícito.

## Consequências
- Nenhum consumidor rastreia `develop` ou `main`.
- Mudanças quebradoras exigem nota de migração.
