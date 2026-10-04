# Arquitetura do Framework Agentic Vendor-Neutral

## Limites Core / Adapter / Profile

| Camada | Define | Não conhece |
|---|---|---|
| **Core** (`src/core/`) | O QUE deve acontecer: tipos, máquina de estados, portas, guardrails, gates (intenção) | Vendors, stacks, comandos concretos |
| **Adapter** (`src/adapters/`) | COMO uma ferramenta de IA executa: roteamento, agentes, tokens | Stacks específicas (usa profile via Core) |
| **Profile** (`src/profile/`) | COMO os gates mapeiam para uma stack: comandos reais | Vendors, lógica de execução |

## Regra de Dependência
- `adapter -> core` ✅
- `profile -> core` ✅
- `core -> adapter` ❌ (proibido)
- `core -> profile` ❌ (proibido)
- `adapter -> profile` ❌ (proibido; profile chega via injeção pela porta do Core)

## Reconciliação com o Monitor V4
A referência externa `MarketingOps-Sprint-Monitor-v4.0.ps1` foi analisada (seções 5-7 do loop-state).
Comportamentos reutilizáveis extraídos: loop de observação paramétrico, fail-closed de Git, detecção de
branch/sprint, checkpoint reporting, change detection, stall detection, persistência histórica.

Correções aplicadas no framework:
- Escrita dentro do workspace (V4 escrevia em `C:\Temp`).
- Eventos JSON estruturados com `schemaVersion` (V4 usava texto livre).
- Correlação completa: `sprintId`, `cycle`, `iteration`, `phase`, `role`, `branch`, `shaBase`.
- Redação obrigatória de segredos (V4 copiava conteúdo cru).
- Cobertura dos 4 estados terminais (V4 detectava apenas 2).
- Vendor-neutral: sem branding de OpenCode/Marketing.Ops.

O script V4 permanece externo e somente leitura — não é dependência de runtime.
