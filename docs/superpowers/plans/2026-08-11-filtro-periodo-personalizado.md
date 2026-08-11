# Filtro de período personalizado

**Objetivo:** adicionar seleção de data inicial e final aos filtros da Visão Geral, Leads e Pipeline, preservando os atalhos existentes.

## Implementação

1. Criar testes de contrato e de cálculo de datas antes do código de produção.
2. Centralizar tipos e cálculos de período em `src/lib/lead-period-filter.ts`, com datas locais inclusivas e período anterior de igual quantidade de dias.
3. Criar um seletor reutilizável de data inicial/final, impedindo intervalos invertidos.
4. Integrar o seletor ao hook compartilhado por Leads/Pipeline e à Visão Geral.
5. Executar testes, verificação TypeScript e build de produção.

