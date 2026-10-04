# ADR-001: Vendor-Neutral

## Status
Aceito

## Contexto
O framework deve ser reutilizável com qualquer ferramenta de IA (OpenCode, Codex, etc.).

## Decisão
Core não conhece vendors. Adapters implementam particularidades. Profiles mapeiam gates para stacks.

## Consequências
- Nenhum SDK de vendor no Core.
- Novos vendors exigem novo adapter, sem alterar o Core.
