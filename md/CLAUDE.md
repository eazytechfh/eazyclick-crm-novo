# CLAUDE.md — Template para Repositórios

> Copie este arquivo para a raiz de cada repositório e preencha as seções marcadas com [].
> O Claude Code lê este arquivo automaticamente ao abrir o projeto.

---

# [NOME DO SISTEMA]

**Tipo:** CRM / ERP  
**Cliente:** [Nome do cliente]  
**Ambiente de produção:** [URL na Vercel]  
**Repositório:** [URL no GitHub]  
**Última auditoria:** [Data]

---

## Stack

- **Frontend:** [ex: Next.js 14, React 18, Tailwind CSS]
- **Backend:** [ex: Next.js API Routes / Supabase Edge Functions]
- **Banco de dados:** [ex: Supabase (PostgreSQL)]
- **Autenticação:** [ex: Supabase Auth]
- **Deploy:** Vercel
- **Storage:** [ex: Supabase Storage]
- **Integrações externas:** [ex: Evolution API (WhatsApp), Stripe, SendGrid]

---

## Estrutura do projeto

```
/
├── app/              # Rotas (Next.js App Router)
├── components/       # Componentes React
├── lib/              # Utilitários e clientes
├── hooks/            # Custom hooks
├── types/            # TypeScript types
└── supabase/
    └── migrations/   # Migrations do banco
```

---

## Convenções importantes

- [ex: Sempre usar server components por padrão, client components apenas quando necessário]
- [ex: Todas as queries ao banco passam pela pasta /lib/db/]
- [ex: Variáveis de ambiente sensíveis nunca no client-side]
- [ex: Padrão de nomes: kebab-case para arquivos, PascalCase para componentes]

---

## Regras — O QUE NÃO MEXER

> Estas áreas exigem atenção especial — qualquer alteração pode quebrar o sistema.

- [ex: `/app/api/webhooks/` — webhooks em produção, não alterar sem testar]
- [ex: `supabase/migrations/` — nunca editar migrations existentes, apenas criar novas]
- [ex: `/lib/auth.ts` — lógica de autenticação crítica]

---

## Multi-tenancy

- **Modelo:** [ex: Row-Level Security (RLS) no Supabase]
- **Coluna de tenant:** [ex: `organization_id` em todas as tabelas]
- **Regra:** Toda query deve filtrar por `organization_id`. Nunca remover este filtro.

---

## Variáveis de ambiente necessárias

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# [Adicionar outras variáveis específicas do sistema]
```

---

## Como rodar localmente

```bash
npm install
cp .env.example .env.local
# Preencher as variáveis no .env.local
npm run dev
```

---

## Contexto de negócio

[Descreva em 2-3 linhas o que este sistema faz, quem usa e qual o fluxo principal.
Exemplo: CRM para concessionária de veículos. Vendedores cadastram leads, acompanham 
negociações e recebem notificações via WhatsApp. O fluxo principal é: lead → proposta → 
aprovação → contrato.]

---

## Problemas conhecidos

- [Liste qualquer bug ou limitação conhecida que o Claude deve estar ciente]

---

## Auditoria — Links rápidos

- Issues encontrados: `AUDITORIA/resultados/[SISTEMA]/issues.md`
- Changelog de correções: `AUDITORIA/resultados/[SISTEMA]/changelog.md`
- Prompts de auditoria: `AUDITORIA/prompts/`
