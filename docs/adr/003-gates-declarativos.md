# ADR-003: Gates Declarativos

## Status
Aceito

## Contexto
Quality gates devem ser portáteis entre stacks.

## Decisão
Gate genérico = intenção (Core). Comando concreto = profile. `AGENTS.md` é fonte de verdade.

## Consequências
- Trocar stack = trocar profile, sem alterar Core.
- Gate indisponível = FAIL (fail-closed, nunca skip).
