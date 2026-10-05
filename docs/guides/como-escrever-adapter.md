# Como Escrever um Adapter

## Contrato
Implemente a interface `AgenticAdapter` (definida em `src/core/ports.ts`):
- `identifyRoles()`: retorna os IDs dos 6 papéis canônicos.
- `applyRouting(roles)`: valida e aplica roteamento (fail-closed).
- `reportRoutingStatus()`: retorna estado do roteamento.
- `resolveGate(gate, profile)`: resolve comando via profile.
- `serializeLoopState(state)` / `deserializeLoopState(json)`: persistência.
- `emit(event)`: envia evento ao monitor.

## Regras
1. O Core não conhece vendors — todo acoplamento vive no adapter.
2. Use apenas portas do Core (nunca implementações concretas de outros adapters).
3. Roteamento é fail-closed: substituto ou fallback → `INVALID_AGENT_ROUTING`.
4. Use `src/adapters/fake/fake-adapter.ts` como referência de implementação.
