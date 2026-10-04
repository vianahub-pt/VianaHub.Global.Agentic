# Versionamento e Consumidores

## REL-01: Estrutura SemVer

O framework é versionado por [SemVer](https://semver.org/lang/pt-BR/) com tags imutáveis.
A versão atual é `0.0.0` (pré-publicação, Sprint 0).

## REL-02: Política de Branch Tracking

- Consumidores **não** rastreiam `develop` nem `main`.
- Dependem de versão publicada (tag SemVer imutável).
- Upgrade é explícito e documentado.

## REL-03: Guia de Upgrade

1. Consultar `CHANGELOG.md` para notas de migração (mudanças quebradoras).
2. Atualizar a dependência para a nova versão no `package.json`.
3. Executar `npm install` para resolver a nova árvore de dependências.
4. Aplicar as mudanças de migração descritas no changelog, se houver.
5. Executar os testes do consumidor para validar a integração.

## REL-04: Mudanças Quebradoras

Toda mudança quebradora exige nota de migração no `CHANGELOG.md`, com passos claros de atualização.

## REL-05: Não-Publicação (Sprint 0)

A Sprint 0 **não** publica versão, tag, release ou pacote. A publicação é fronteira de aprovação humana.
Evidência: nenhum `git tag`, `npm publish` ou GitHub release foi executado durante o loop da Sprint 0.
