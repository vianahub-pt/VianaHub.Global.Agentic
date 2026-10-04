# Como Escrever um Profile

## Contrato
Implemente `StackProfile` (definida em `src/core/ports.ts`):
- `validGateIds`: lista dos gates suportados pela stack.
- `commands`: mapa `GateId -> NonEmptyString` com o comando real.

## Regras
1. Perfil é **dado declarativo** (dados, não código imperativo).
2. Gate sem mapeamento → `UNAVAILABLE` (fail-closed, nunca skip).
3. Use `toNonEmptyString()` para validar comandos (nunca string vazia).
4. Use `src/profile/node-typescript.profile.ts` como referência.
