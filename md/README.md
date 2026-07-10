# Sistema de Auditoria para CRMs

Conjunto de prompts para auditar sistemas CRM de forma completa e estruturada.
Cada arquivo é um prompt especializado para ser usado com Claude (ou outro LLM).

---

## Como usar

### Passo 1 — Forneça o contexto do sistema

Antes de executar qualquer auditoria, forneça ao Claude o contexto do projeto. Você pode fazer isso de uma das formas abaixo:

**Opção A — Colar o código diretamente**
Cole os arquivos relevantes (schema do banco, rotas da API, componentes principais) no início da conversa antes de enviar o prompt de auditoria.

**Opção B — Usar o Claude com acesso à pasta**
Abra a pasta do projeto no Cowork e peça ao Claude para ler os arquivos antes de executar a auditoria.

**Opção C — Descrever a arquitetura manualmente**
Envie uma descrição da stack (ex: "Next.js + Supabase + Vercel, multi-tenant, integração com WhatsApp via Evolution API") antes do prompt.

---

## Ordem de execução recomendada

Execute nesta sequência para que a Auditoria Final tenha todos os insumos:

```
1.  Arquitetura.md
2.  banco de dados/Banco de Dados - universal.md
3.  banco de dados/Banco de Dados - supabase.md   ← usar após o universal
4.  Performance.md
5.  Segurança.md
6.  LGPD e Conformidade.md
7.  Multi-Tenancy.md
8.  Qualidade de Código.md
9.  Escalabilidade.md
10. Observabilidade.md
11. Custo Operacional.md
12. Integrações e Automações.md
13. Auditoria FInal.md                            ← consolidação final
```

> **Dica:** Você não precisa executar todos de uma vez. Para uma análise rápida, comece pelos 3 mais críticos para o seu contexto e execute a Auditoria Final ao final.

---

## Descrição dos arquivos

| Arquivo | O que audita |
|---|---|
| `Arquitetura.md` | Mapeamento completo da arquitetura, acoplamentos e pontos de falha |
| `Performance.md` | Gargalos de frontend, backend, banco e infra |
| `Segurança.md` | Vulnerabilidades OWASP, autenticação, autorização |
| `LGPD e Conformidade.md` | Conformidade com LGPD/GDPR, direitos dos titulares |
| `Multi-Tenancy.md` | Isolamento de dados entre clientes no modelo SaaS |
| `Qualidade de Código.md` | Código morto, duplicação, complexidade, manutenibilidade |
| `Escalabilidade.md` | Simulação de 10x/50x/100x usuários, gargalos futuros |
| `Observabilidade.md` | Logs, métricas, alertas, rastreamento de erros |
| `Custo Operacional.md` | Recursos desperdiçados, consultas desnecessárias, oportunidades de economia |
| `Integrações e Automações.md` | APIs externas, webhooks, fluxos, confiabilidade |
| `banco de dados/Banco de Dados - universal.md` | Auditoria completa do banco (qualquer banco relacional) |
| `banco de dados/Banco de Dados - supabase.md` | Complemento para Supabase: RLS, RPC, Edge Functions |
| `banco de dados/Banco de Dados - sistemaGigante.md` | Planejamento para 100k–10M registros |
| `Auditoria FInal.md` | Relatório executivo consolidado + roadmap em 4 fases |

---

## Dicas de uso

- **Salve os resultados** de cada auditoria antes de executar a próxima. Quando chegar na Auditoria Final, cole todos os resultados anteriores na conversa.
- **Priorize pelo impacto** — não precisa corrigir tudo de uma vez. A Auditoria Final entrega um roadmap para isso.
- **Repita periodicamente** — recomendado rodar o ciclo completo a cada trimestre ou antes de grandes releases.
