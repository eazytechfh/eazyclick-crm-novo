# Auditoria, Vendas, Estoque e Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar auditoria confiável, fechamento validado, estoque canônico e feedback automotivo no CRM.

**Architecture:** Regras críticas ficam em migration PostgreSQL e helpers puros testáveis. A UI confirma mutações antes de atualizar estado e componentes globais concentram notificações e celebração.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind, Supabase/PostgreSQL, `node:test`.

## Global Constraints

- Não aplicar migration no banco compartilhado sem autorização explícita.
- Fechamento real usa o slug existente `fechado`.
- Áudio nunca pode reverter ou quebrar uma mutação confirmada.
- Celebração dura exatamente 5.000 ms e respeita `prefers-reduced-motion`.
- Logs são escritos por triggers, limitados na leitura e imutáveis para clientes.
- Estoque persiste apenas `disponivel`, `indisponivel` ou `vendido`.

---

### Task 1: Contratos e regras puras

**Files:**
- Create: `tests/crm-automotivo.test.js`
- Create: `src/lib/crm-automotivo.ts`

**Interfaces:**
- Produces: `normalizarTexto`, `validarFechamento`, `normalizarStatusEstoque`.

- [ ] Escrever testes que rejeitam nome vazio, valores não finitos/não positivos, normalizam acentos/caixa e reconhecem troca real de vendedor.
- [ ] Executar `npm test` e confirmar falha por arquivos/comportamentos ausentes.
- [ ] Implementar os helpers puros mínimos.
- [ ] Executar `npm test` e confirmar sucesso.

### Task 2: Migration de auditoria e integridade

**Files:**
- Create: `supabase/migrations/0016_auditoria_vendas_estoque.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `lead_logs`, metadados persistidos da observação, validação de `fechado`, status canônico e RPC `fechar_venda`.

- [ ] Testar contratos SQL: índice, RLS somente leitura, trigger geral, autoria autenticada e validações.
- [ ] Confirmar RED.
- [ ] Criar migration idempotente, sem executá-la no ambiente remoto.
- [ ] Confirmar GREEN.

### Task 3: Componentes globais de feedback

**Files:**
- Create: `src/components/AutomotiveLoading.tsx`
- Create: `src/components/LeadAssignedWatcher.tsx`
- Create: `src/components/SaleCelebration.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- `LeadAssignedWatcher({ sellerName })` retorna `null`.
- `SaleCelebration({ leadName, onClose })` toca os dois assets uma vez e encerra em 5 s.

- [ ] Testar acessibilidade, baseline, polling de 15 s, cleanup, offsets/volumes e duração.
- [ ] Confirmar RED.
- [ ] Implementar componentes e animações reduzidas.
- [ ] Confirmar GREEN.

### Task 4: Leads e pipeline

**Files:**
- Modify: `src/components/LeadDrawer.tsx`
- Modify: `src/app/(app)/pipeline/page.tsx`

**Interfaces:**
- Consumes: RPC `fechar_venda`, `lead_logs`, `SaleCelebration`.

- [ ] Testar autoria/data, paginação de logs, scroll do histórico, som pós-transferência e modal de fechamento.
- [ ] Confirmar RED.
- [ ] Implementar persistência confirmada e sem movimento otimista para `fechado`.
- [ ] Confirmar GREEN.

### Task 5: Estoque

**Files:**
- Modify: `src/app/(app)/estoque/page.tsx`

**Interfaces:**
- Consumes: `normalizarStatusEstoque`.

- [ ] Testar filtro inicial `disponivel` e update confirmado.
- [ ] Confirmar RED.
- [ ] Implementar filtros canônicos e edição no modal com erro recuperável.
- [ ] Confirmar GREEN.

### Task 6: Assets e verificação

**Files:**
- Create: `public/effects/sale-car-neon.png`
- Pending user-provided: `public/effects/lead-assigned.mp3`
- Pending user-provided: `public/effects/sale-engine.mp3`
- Pending user-provided: `public/effects/sale-money.mp3`

- [ ] Gerar carro em chroma, remover fundo e validar alfa/arestas.
- [ ] Executar testes, type-check, lint disponível, build e `git diff --check`.
- [ ] Revisar todos os requisitos e documentar a aplicação manual da migration e os MP3s pendentes.
