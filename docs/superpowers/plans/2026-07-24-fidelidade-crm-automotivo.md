# Fidelidade CRM Automotivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o CRM Ales Car fiel ao feedback, auditoria e sincronização do CRM de referência sem reload periódico da página.

**Architecture:** Um watcher global mantém baseline de IDs atribuídos, usa Realtime como caminho principal e emite um evento local apenas quando a atribuição muda. Leads e Pipeline refazem sua consulta somente nesse evento; uma migration corretiva separada retém logs, restringe RLS e habilita a publication.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase/PostgreSQL, node:test.

## Global Constraints

- Não editar a migration `0016`; correções de banco ficam em `0017`.
- Não aplicar migrations automaticamente ao banco compartilhado.
- Celebração e áudios duram 5 segundos.
- Realtime é principal; polling ocorre a cada 180 segundos apenas como fallback.

---

### Task 1: Contratos de regressão

- [x] Criar testes para callback estável, atualização sem refresh, visual fiel e migration corretiva.
- [x] Executar testes e confirmar falhas pelos recursos ausentes.

### Task 2: Celebração fiel

- [x] Estabilizar `onClose` com `useCallback`.
- [x] Restaurar composição neon, velocidade, glow, copy e carro exato.
- [x] Preservar offsets e volumes dos dois MP3s.

### Task 3: Atribuições em máquinas diferentes

- [x] Consultar somente IDs do vendedor.
- [x] Emitir evento local quando o conjunto mudar.
- [x] Atualizar Leads e Pipeline somente no evento.
- [x] Aumentar fallback para 180 segundos.

### Task 4: Auditoria e Realtime

- [x] Criar migration `0017` com retenção após delete, RLS por visibilidade/role e ações classificadas.
- [x] Habilitar `BASE_DE_LEADS` na publication de forma idempotente.
- [x] Remover constraint invasiva do estoque.

### Task 5: Verificação

- [ ] Executar testes, type-check, build e revisão do diff.
