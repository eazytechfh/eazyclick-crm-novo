# Resumo de Qualificação via Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** adicionar ao drawer do lead um botão que solicita a geração de resumo por IA enviando o telefone cadastrado ao webhook `https://n8n.eazy.tec.br/webhook/resumo-comercial-crm`.

**Architecture:** o navegador enviará apenas o ID do lead a uma rota interna autenticada. A rota consultará o telefone no Supabase com escopo da empresa e chamará um endereço fixo do n8n, evitando CORS, exposição da integração e envio de telefones arbitrários pelo cliente.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase SSR, Node `fetch`, testes `node:test`.

## Global Constraints

- O webhook usa método `POST` e corpo JSON `{ "telefone": "<telefone cadastrado>" }`.
- A URL externa é fixa e não pode ser fornecida pelo cliente.
- O endpoint exige uma sessão autenticada e só busca leads de `id_empresa = 1`.
- O botão exibe carregamento, confirmação acessível e erro recuperável.
- Nenhuma migration ou alteração de banco será criada.

---

### Task 1: Rota autenticada do webhook

**Files:**
- Create: `src/app/api/leads/[id]/resumo-qualificacao/route.ts`
- Test: `tests/resumo-qualificacao-webhook.test.js`

**Interfaces:**
- Consumes: parâmetro de rota `id` e sessão Supabase do usuário.
- Produces: `POST /api/leads/:id/resumo-qualificacao`, com `{ ok: true, leadId }` em sucesso.

- [ ] **Step 1: Write the failing test**

```js
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /\.select\('id, telefone'\)/);
assert.match(route, /JSON\.stringify\(\{ telefone: lead\.telefone \}\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resumo-qualificacao-webhook.test.js`
Expected: FAIL porque a rota ainda não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ telefone: lead.telefone }),
});
```

A rota valida ID, sessão, existência do lead e telefone, aplica timeout e converte falhas externas em resposta `502` sem expor detalhes internos.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/resumo-qualificacao-webhook.test.js`
Expected: PASS para autenticação, consulta segura e payload.

### Task 2: Botão no resumo de qualificação

**Files:**
- Modify: `src/components/LeadDrawer.tsx`
- Test: `tests/resumo-qualificacao-webhook.test.js`

**Interfaces:**
- Consumes: `POST /api/leads/:id/resumo-qualificacao`.
- Produces: botão “Criar resumo com IA”, indicador “Gerando...” e mensagem de sucesso/erro em `role="status"`.

- [ ] **Step 1: Write the failing test**

```js
assert.match(drawer, /Criar resumo com IA/);
assert.match(drawer, /fetch\(`\/api\/leads\/\$\{lead\.id\}\/resumo-qualificacao`/);
assert.match(drawer, /Resumo solicitado\. Ele será atualizado em instantes\./);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resumo-qualificacao-webhook.test.js`
Expected: FAIL porque o botão ainda não existe.

- [ ] **Step 3: Write minimal implementation**

O componente mantém `gerandoResumo` e `mensagemResumo`, bloqueia cliques duplicados, desabilita quando não há telefone e só confirma quando a rota retorna `ok: true` e o mesmo `leadId`.

- [ ] **Step 4: Run all verification**

Run: `npm test`, `npx tsc --noEmit --incremental false` e `npm run build`.
Expected: todos os testes, tipos e build aprovados.
