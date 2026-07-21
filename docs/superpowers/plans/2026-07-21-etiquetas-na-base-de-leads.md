# Etiquetas na BASE_DE_LEADS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor as etiquetas de cada lead em uma coluna-lista `etiquetas` na `BASE_DE_LEADS`, mantendo-a sincronizada com a relação N:N existente.

**Architecture:** A tabela `lead_etiquetas` continua garantindo unicidade e referências válidas. Uma coluna `bigint[]` na `BASE_DE_LEADS` funciona como representação conveniente para integrações, com triggers bidirecionais, normalização e carga dos vínculos existentes.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, Node.js test runner.

## Global Constraints

- A coluna deve aceitar zero, uma ou várias etiquetas.
- Cada item deve ser um ID existente em `public.etiquetas`.
- Alterações pela coluna e por `lead_etiquetas` devem produzir o mesmo estado.
- Migrações e arquivos de teste já existentes no worktree não devem ser alterados.

---

### Task 1: Contrato testável da migração

**Files:**
- Create: `tests/etiquetas-base-de-leads.test.js`
- Test: `tests/etiquetas-base-de-leads.test.js`

**Interfaces:**
- Consumes: migração `supabase/migrations/0014_etiquetas_na_base_de_leads.sql`.
- Produces: verificações para coluna `bigint[]`, carga inicial, validação e sincronização bidirecional.

- [ ] **Step 1: Escrever testes que leem a migração e exigem o contrato SQL**
- [ ] **Step 2: Executar `node --test tests/etiquetas-base-de-leads.test.js`**

Expected: FAIL porque a migração `0014_etiquetas_na_base_de_leads.sql` ainda não existe.

### Task 2: Migração e sincronização bidirecional

**Files:**
- Create: `supabase/migrations/0014_etiquetas_na_base_de_leads.sql`
- Test: `tests/etiquetas-base-de-leads.test.js`

**Interfaces:**
- Consumes: `BASE_DE_LEADS(id)`, `etiquetas(id)` e `lead_etiquetas(id_lead, id_etiqueta)`.
- Produces: `BASE_DE_LEADS.etiquetas bigint[]`, `sync_base_de_leads_etiquetas()` e `sync_lead_etiquetas_para_base()`.

- [ ] **Step 1: Adicionar `etiquetas bigint[] not null default '{}'::bigint[]`**
- [ ] **Step 2: Preencher a lista com IDs ordenados dos vínculos existentes**
- [ ] **Step 3: Normalizar IDs repetidos/nulos e rejeitar IDs inexistentes antes de gravar a lista**
- [ ] **Step 4: Sincronizar inserts/deletes em `lead_etiquetas` quando a lista mudar**
- [ ] **Step 5: Recalcular a lista após inserts/deletes diretos em `lead_etiquetas`**
- [ ] **Step 6: Executar `node --test tests/etiquetas-base-de-leads.test.js`**

Expected: PASS.

### Task 3: Tipagem e regressão

**Files:**
- Modify: `src/types/database.ts`
- Test: `tests/etiquetas-base-de-leads.test.js`

**Interfaces:**
- Consumes: coluna SQL `etiquetas bigint[]`.
- Produces: `BaseDeLeads.etiquetas: number[]`.

- [ ] **Step 1: Adicionar ao teste a exigência da propriedade TypeScript**
- [ ] **Step 2: Executar o teste e confirmar falha pela propriedade ausente**
- [ ] **Step 3: Adicionar `etiquetas: number[]` à interface `BaseDeLeads`**
- [ ] **Step 4: Executar `npm test` e `npm run build`**

Expected: todos os testes e o build passam.
