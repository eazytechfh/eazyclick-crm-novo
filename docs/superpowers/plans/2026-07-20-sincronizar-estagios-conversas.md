# Sincronização de Estágios pelas Conversas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classificar leads pelas conversas do WhatsApp, desligar o bot após transferência e atualizar o CRM com auditoria e histórico.

**Architecture:** Um módulo puro concentra normalização, identificação de sessões de vendedores/notificações, classificação e geração das propostas. Um script Node carrega o Supabase em páginas, gera relatório em modo dry-run por padrão e somente escreve quando chamado com `--apply`; depois relê os registros para verificar o resultado.

**Tech Stack:** Node.js, JavaScript CommonJS, `node:test`, Supabase JS.

## Global Constraints

- Mensagens `system` nunca qualificam um lead.
- Sessões de vendedores e destinatários de notificações são excluídas.
- Prioridade: transferência confirmada > resposta da IA > mensagem humana.
- `follow_up`, `fechado`, `nao_fechou` e `pesquisa_atendimento` não são rebaixados.
- Todo lead transferido recebe `bot_ativo = "false"`.
- Dry-run é o padrão; escrita exige `--apply`.
- Toda mudança de estágio gera `lead_historico_estagio`.

---

### Task 1: Regras puras e testes

**Files:**
- Create: `scripts/sync-lead-stages-lib.js`
- Test: `scripts/sync-lead-stages-lib.test.js`

**Interfaces:**
- Consumes: linhas de `BASE_DE_LEADS`, `VENDEDORES` e `atualveiculos_chat_histories`.
- Produces: `buildAudit({ leads, vendors, histories })`, com propostas por lead e estatísticas agregadas.

- [ ] **Step 1: Escrever testes que cubram telefone com/sem 55, `system`, vendedor, transferência, preservação de etapas e `bot_ativo`.**
- [ ] **Step 2: Executar `node --test scripts/sync-lead-stages-lib.test.js`; esperado: falha porque o módulo ainda não existe.**
- [ ] **Step 3: Implementar as funções puras mínimas.**
- [ ] **Step 4: Reexecutar o teste; esperado: todos passam.**

### Task 2: Runner auditável

**Files:**
- Create: `scripts/sync-lead-stages.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.env.local`, `--apply` opcional.
- Produces: relatório JSON sem dados pessoais; em `--apply`, atualizações verificadas e históricos.

- [ ] **Step 1: Escrever teste para o parser de modo, garantindo dry-run sem `--apply`.**
- [ ] **Step 2: Executar o teste e confirmar a falha esperada.**
- [ ] **Step 3: Implementar paginação, prévia, updates em lotes, histórico e verificação.**
- [ ] **Step 4: Executar todos os testes e `npm run type-check`.**

### Task 3: Simulação e aplicação

**Files:**
- No source changes.

**Interfaces:**
- Consumes: script validado e banco atual.
- Produces: contagens antes/depois e confirmação de inconsistências igual a zero.

- [ ] **Step 1: Executar `npm run sync:lead-stages`; esperado: `mode: dry-run`, sem escrita.**
- [ ] **Step 2: Conferir contagens e abortar se houver ambiguidade.**
- [ ] **Step 3: Executar `npm run sync:lead-stages -- --apply`.**
- [ ] **Step 4: Relê-los e confirmar estágios, `bot_ativo` e histórico.**

