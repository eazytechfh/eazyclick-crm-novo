# Leads, IA, Segurança e Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar exclusão segura de leads, controle persistente da IA, proteção de cargos e feedback de observação, preservando a marca dinâmica existente.

**Architecture:** Manter o `LeadDrawer` compartilhado e propagar updates/deletes aos três consumidores locais. Operações destrutivas e de IA passam por rotas internas autenticadas que usam o cliente Supabase da sessão, filtro do tenant single-tenant `id_empresa = 1` e RLS; invariantes de cargo e timestamp ficam no PostgreSQL.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Node test runner.

## Global Constraints

- Não fazer reload completo da página.
- Não usar service role no navegador nem aplicar migrations remotamente.
- Não enviar webhook/n8n no fluxo de IA.
- Não fazer commit, push ou deploy.
- Executar cada comportamento em RED → GREEN.

---

### Task 1: Invariantes de banco e tipos da IA

**Files:**
- Create: `supabase/migrations/0015_lead_ia_e_protecao_cargo.sql`
- Modify: `src/types/database.ts`
- Test: `tests/lead-ia-seguranca.test.js`

**Interfaces:**
- Produces: `BaseDeLeads.bot_ativo: boolean` e `bot_ativo_alterado_em: string | null`.
- Produces: trigger de timestamp e trigger que impede autoelevação de `profiles.cargo`.

- [ ] Escrever testes estáticos que exijam backfill/default/not-null, timestamp com `now()` e bloqueio SQLSTATE `42501`.
- [ ] Rodar `npm test -- tests/lead-ia-seguranca.test.js` e confirmar falha pela ausência da migration/campos.
- [ ] Criar a migration idempotente e atualizar o tipo TypeScript.
- [ ] Rodar o teste e confirmar sucesso.

### Task 2: Rotas autenticadas de lead

**Files:**
- Create: `src/app/api/leads/[id]/route.ts`
- Create: `src/app/api/leads/[id]/ia/route.ts`
- Test: `tests/lead-ia-seguranca.test.js`

**Interfaces:**
- Produces: `DELETE /api/leads/:id -> { id: number }`.
- Produces: `PATCH /api/leads/:id/ia` com `{ ativo: boolean } -> { id, bot_ativo, bot_ativo_alterado_em }`.

- [ ] Escrever testes exigindo validação, sessão, cargo, `id_empresa = 1`, cliente autenticado, retorno confirmado e transição atômica.
- [ ] Confirmar RED.
- [ ] Implementar as rotas sem cliente admin e sem chamadas externas.
- [ ] Confirmar GREEN.

### Task 3: Drawer e sincronização local

**Files:**
- Modify: `src/components/LeadDrawer.tsx`
- Modify: `src/app/(app)/leads/page.tsx`
- Modify: `src/app/(app)/pipeline/page.tsx`
- Modify: `src/components/NegociacaoTimerWatcher.tsx`
- Test: `tests/lead-drawer-seguranca.test.js`

**Interfaces:**
- Consumes: as duas rotas da Task 2.
- Produces: prop `onDeleted(leadId: number)` e mantém `onUpdated(lead)`.

- [ ] Escrever testes para modal acessível, loading/erro, confirmação de resposta, UI não otimista, status/data da IA e sucesso da observação.
- [ ] Confirmar RED.
- [ ] Implementar estados e handlers no drawer e remover/atualizar por ID nos três consumidores.
- [ ] Confirmar GREEN.

### Task 4: Consultas e preservação do branding

**Files:**
- Modify: `src/app/(app)/leads/page.tsx`
- Modify: `src/app/(app)/pipeline/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/NegociacaoTimerWatcher.tsx`
- Test: `tests/lead-drawer-seguranca.test.js`

**Interfaces:**
- Produces: todas as consultas completas incluem `bot_ativo_alterado_em`.
- Preserves: logo dinâmica existente, sem introduzir fallback de outra marca.

- [ ] Escrever testes para consultas e preservar o branding existente.
- [ ] Confirmar RED.
- [ ] Atualizar selects e sidebar, preservando branding dinâmico.
- [ ] Confirmar GREEN.

### Task 5: Verificação final

**Files:**
- Review: todos os arquivos modificados.

- [ ] Rodar `npm test`.
- [ ] Rodar `npx tsc --noEmit`.
- [ ] Rodar `npm run lint` se o comando for suportado pelo Next.js instalado.
- [ ] Rodar `npm run build`.
- [ ] Rodar `git diff --check` e procurar webhook/n8n/fetch externo no fluxo da IA.
- [ ] Revisar autorização, IDOR, RLS, respostas de erro e diff completo; corrigir achados Critical/Important.
