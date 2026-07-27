# Venda Vinculada ao Estoque e SQL Universal Automotivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir a seleção pesquisável de um veículo disponível ao fechar uma venda, atualizar lead e estoque atomicamente e consolidar um bootstrap universal para novos projetos Supabase de CRM automotivo.

**Architecture:** O modal consulta `public."ESTOQUE"` e oferece um combobox local que filtra marca, modelo, ano e placa. Uma RPC `SECURITY DEFINER`, com autorização e locks, fecha o lead e muda o veículo para `vendido` na mesma transação; uma migration nova preserva quem já aplicou a `0017`.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind, Supabase/PostgreSQL e Node Test.

## Global Constraints

- Não executar migration no banco.
- Preservar as migrations anteriores e criar `0018`.
- Usar a tabela real `public."ESTOQUE"` e status canônico `disponivel`/`vendido`.
- Manter compatibilidade com n8n e demais automações.
- O SQL universal é destrutivo e serve somente para bancos novos.

---

### Task 1: Contrato de regressão

**Files:**
- Modify: `tests/crm-automotivo.test.js`

**Interfaces:**
- Consumes: fonte do pipeline, migration `0018` e SQL universal.
- Produces: verificações do combobox, RPC transacional e consolidado.

- [x] Escrever assertions para pesquisa, lista abaixo, scroll e ausência do `select` nativo.
- [x] Escrever assertions para vínculo do veículo, locks e atualização para `vendido`.
- [x] Executar o teste e observar falha pela ausência da funcionalidade.

### Task 2: Fechamento vinculado ao estoque

**Files:**
- Modify: `src/app/(app)/pipeline/page.tsx`
- Create: `supabase/migrations/0018_venda_vinculada_estoque.sql`

**Interfaces:**
- Consumes: `BASE_DE_LEADS.id`, `ESTOQUE.id`, `get_my_cargo()` e `get_my_nome()`.
- Produces: `fechar_venda_com_veiculo(int4,text,numeric,text)`.

- [x] Listar somente veículos cujo status normalizado seja `disponivel`.
- [x] Implementar input pesquisável e dropdown `top-full max-h-60`.
- [x] Exigir seleção válida antes de confirmar.
- [x] Implementar RPC com `FOR UPDATE`, autorização e updates atômicos.
- [x] Executar o teste e confirmar aprovação.

### Task 3: Prompt e SQL universal

**Files:**
- Modify: `docs/PROMPT-UNIVERSAL-CRM-AUTOMOTIVO-GPT-5.6-SOL.md`
- Create: `docs/sql/TEMPLATE-BASE-CRM-AUTOMOTIVO-UNIVERSAL.sql`

**Interfaces:**
- Consumes: template universal fornecido e migrations `0001` a `0018`.
- Produces: instruções reutilizáveis e bootstrap de banco novo.

- [x] Documentar escolha obrigatória, combobox e transação atômica.
- [x] Consolidar colunas, funções, triggers, RLS e Realtime do projeto.
- [x] Validar contratos críticos e diferenças de nomes/tipos.

### Task 4: Validação final

**Files:**
- Test: `tests/*.test.js`

**Interfaces:**
- Consumes: implementação completa.
- Produces: evidência de testes, TypeScript, build e diff.

- [x] Executar `npm test`.
- [x] Executar `npx tsc --noEmit`.
- [x] Executar `npm run build`.
- [x] Executar `git diff --check`.
