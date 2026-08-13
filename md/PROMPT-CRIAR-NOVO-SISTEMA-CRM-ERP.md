# Prompt mestre para criar um novo CRM/ERP SaaS sem repetir os erros auditados

Use este prompt no Claude/Codex para criar um novo sistema CRM/ERP baseado nas funcionalidades dos sistemas auditados, mas com arquitetura moderna, performance alta, isolamento multi-tenant real e manutenção simples.

---

## Papel do agente

Você é um Principal Software Engineer, Solutions Architect, Performance Engineer e Security Engineer.

Sua missão é projetar e implementar um sistema SaaS CRM/ERP multi-tenant, inspirado em sistemas de CRM de leads, funil Kanban, agendamentos, estoque, dashboards, integrações WhatsApp/webhooks e módulos ERP operacionais.

Antes de implementar, você deve propor arquitetura, modelo de dados, rotas, componentes, fluxos e plano de execução. Não escreva código sem primeiro estruturar a solução.

---

## Objetivo do sistema

Criar uma aplicação SaaS para empresas gerenciarem:

- Leads e negociações
- Kanban comercial
- Agendamentos e visitas
- Histórico de movimentações
- Usuários, cargos e permissões
- Estoque ou catálogo de veículos/produtos
- Dashboard executivo
- Integrações externas, especialmente WhatsApp/webhooks
- Logs de auditoria
- Configurações por empresa/tenant
- Módulos ERP opcionais: clientes, contratos, serviços, financeiro, estoque, equipe e documentos

O sistema deve nascer preparado para crescer sem ficar lento, pesado ou difícil de manter.

---

## Stack recomendada

Use preferencialmente:

- Next.js App Router
- React com Server Components por padrão
- TypeScript estrito
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage privado
- Supabase RLS obrigatório
- Tailwind CSS
- shadcn/ui ou biblioteca equivalente
- TanStack Query ou mecanismo equivalente para cache client-side
- Zod para validação de entrada
- Server Actions ou API Routes para operações sensíveis
- Recharts apenas com lazy loading
- Drag and drop apenas nas telas que realmente precisam

Evite criar autenticação própria.
Evite senha em tabela customizada.
Evite guardar sessão/permissão em localStorage.
Evite lógica crítica direto no browser.

---

## Princípios obrigatórios

1. Segurança antes de UI.
2. Multi-tenancy no banco, não apenas no front-end.
3. Performance por desenho, não por remendo.
4. Componentes pequenos, focados e testáveis.
5. Consultas mínimas e explícitas.
6. Dados agregados no banco, não no browser.
7. Realtime com delta, não reload completo.
8. Integrações externas via backend, nunca hardcoded no client.
9. Observabilidade desde o primeiro dia.
10. Nenhum módulo gigante com dezenas de responsabilidades.

---

## Erros dos sistemas anteriores que devem ser evitados

Não repetir estes problemas:

- Componentes enormes de 70KB a 180KB concentrando tela inteira, filtros, modais, formulários, calendário, upload, integrações e regras de negócio.
- Uso massivo de `"use client"` sem necessidade.
- Kanban/listas renderizando grandes volumes sem virtualização.
- `select("*")` em consultas de produção.
- Dashboard carregando milhares de registros para agregar no browser.
- Realtime chamando `loadData()` e recarregando a lista inteira a cada evento.
- Estado demais em uma única tela.
- `localStorage` como fonte de sessão, permissões, dados operacionais ou cache principal.
- Login próprio validando senha diretamente no Supabase.
- Updates/deletes apenas por `id`, sem validar tenant.
- Hard delete em entidades importantes.
- Webhooks externos hardcoded no client.
- Logs de debug com dados pessoais.
- Buckets públicos para arquivos sensíveis.
- Policies RLS permissivas como `auth.role() = 'authenticated'`.
- Scripts SQL soltos sem migrations versionadas.
- Campos pesados, como HTML/documentos, carregados em toda listagem.
- Mocks e dados reais misturados no mesmo fluxo.

---

## Arquitetura esperada

Organize o projeto assim:

```txt
/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── leads/
│   │   ├── kanban/
│   │   ├── agendamentos/
│   │   ├── estoque/
│   │   ├── clientes/
│   │   ├── financeiro/
│   │   └── configuracoes/
│   ├── api/
│   │   ├── webhooks/
│   │   ├── integrations/
│   │   └── cron/
│   └── layout.tsx
├── components/
│   ├── layout/
│   ├── leads/
│   ├── kanban/
│   ├── agendamentos/
│   ├── estoque/
│   ├── dashboard/
│   ├── forms/
│   └── ui/
├── features/
│   ├── leads/
│   ├── agendamentos/
│   ├── estoque/
│   ├── dashboard/
│   ├── clientes/
│   └── financeiro/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── supabase/
│   ├── permissions/
│   ├── integrations/
│   ├── observability/
│   └── utils/
├── server/
│   ├── actions/
│   ├── repositories/
│   ├── services/
│   └── validators/
├── types/
├── supabase/
│   ├── migrations/
│   └── seed/
└── tests/
```

Regras:

- `app/` deve orquestrar rotas e layouts.
- `features/` agrupa domínio e UI específica.
- `server/repositories/` concentra acesso ao banco.
- `server/services/` concentra regras de negócio.
- `components/ui/` não deve conter regra de negócio.
- Nenhuma tela deve virar arquivo gigante.
- Se um arquivo passar de 400 linhas, reavaliar separação.
- Se um componente tiver mais de 8 estados locais relevantes, dividir.

---

## Multi-tenancy obrigatório

Modelo obrigatório:

- Toda entidade de negócio deve ter `organization_id`.
- Todo usuário pertence a uma organização.
- Permissões devem ser derivadas do usuário autenticado e do vínculo com a organização.
- Nunca aceitar `organization_id` vindo livremente do client para autorização.
- Server deve obter o tenant a partir da sessão do usuário.

Tabelas mínimas:

- `organizations`
- `profiles`
- `organization_members`
- `roles`
- `permissions`
- `leads`
- `lead_stage_history`
- `appointments`
- `inventory_items`
- `audit_logs`
- `integration_configs`

RLS obrigatório:

- Ativar RLS em todas as tabelas de negócio.
- Policies devem usar `auth.uid()` e membership.
- SELECT, INSERT, UPDATE e DELETE devem ser cobertos.
- Storage deve isolar arquivos por `organization_id`.
- Buckets sensíveis devem ser privados.

Exemplo conceitual de policy:

```sql
exists (
  select 1
  from organization_members m
  where m.user_id = auth.uid()
    and m.organization_id = table.organization_id
)
```

Proibido:

```sql
using (auth.role() = 'authenticated')
```

exceto em tabelas realmente globais e sem dados sensíveis.

---

## Autenticação e autorização

Use Supabase Auth.

Obrigatório:

- Login por Supabase Auth.
- Sessão via cookies/server client.
- Perfil e permissões carregados no servidor.
- Server Actions/API Routes validam permissão antes de mutar dados.
- UI pode esconder botões, mas backend deve bloquear ações.

Proibido:

- Tabela customizada com senha.
- Comparar senha via `.eq("senha", senha)`.
- Guardar usuário inteiro no localStorage.
- Confiar em `cargo` enviado pelo client.

Cargos sugeridos:

- `owner`
- `admin`
- `manager`
- `sdr`
- `sales`
- `operator`
- `viewer`

Permissões devem ser granulares:

- `leads.read`
- `leads.create`
- `leads.update`
- `leads.delete`
- `appointments.manage`
- `inventory.manage`
- `users.manage`
- `dashboard.read`
- `integrations.manage`

---

## Modelo de dados recomendado

Crie migrations versionadas em `supabase/migrations`.

Entidades principais:

### Leads

Campos:

- `id`
- `organization_id`
- `name`
- `phone`
- `email`
- `source`
- `assigned_to`
- `stage`
- `interest`
- `value`
- `notes`
- `created_at`
- `updated_at`
- `deleted_at`

Índices:

- `(organization_id, stage)`
- `(organization_id, assigned_to)`
- `(organization_id, created_at desc)`
- `(organization_id, source)`

### Agendamentos

Campos:

- `id`
- `organization_id`
- `lead_id`
- `scheduled_date`
- `scheduled_time`
- `status`
- `assigned_to`
- `sdr_id`
- `notes`
- `outcome`
- `created_at`
- `updated_at`
- `deleted_at`

Índices:

- `(organization_id, scheduled_date)`
- `(organization_id, status)`
- `(organization_id, assigned_to)`
- `(organization_id, sdr_id)`

### Estoque / Catálogo

Campos:

- `id`
- `organization_id`
- `name`
- `category`
- `status`
- `price`
- `metadata jsonb`
- `created_at`
- `updated_at`
- `deleted_at`

Índices:

- `(organization_id, status)`
- `(organization_id, category)`

### Histórico

Histórico nunca deve ser `localStorage`.

Use:

- `lead_stage_history`
- `appointment_history`
- `audit_logs`

Cada evento deve registrar:

- quem fez
- quando fez
- entidade
- estado anterior
- estado novo
- metadata mínima

---

## Banco e queries

Regras obrigatórias:

- Nunca usar `select("*")` em listagens.
- Criar constantes de colunas por caso de uso.
- Listagem deve buscar só campos necessários.
- Campos pesados devem ser carregados sob demanda.
- Toda listagem deve ter paginação.
- Toda busca deve ter debounce no client e filtro no servidor.
- Dashboard deve usar RPC/view/materialized view.
- Não carregar 1000+ registros para agregar no browser.

Exemplos:

Errado:

```ts
supabase.from("leads").select("*")
```

Certo:

```ts
supabase
  .from("leads")
  .select("id,name,phone,stage,assigned_to,value,created_at")
  .eq("organization_id", organizationId)
  .range(from, to)
```

Para dashboard, criar RPC:

```sql
get_dashboard_metrics(org_id uuid, start_date timestamptz, end_date timestamptz)
```

Ela deve retornar métricas agregadas, não linhas brutas.

---

## Frontend e renderização

Use Server Components por padrão.

Client Components apenas para:

- interação
- formulários
- drag-and-drop
- filtros locais leves
- modais
- realtime

Regras:

- Não criar página inteira como client component se só parte dela é interativa.
- Separar container de dados, lista, filtros, card, modal e ações.
- Evitar estado global para dados que pertencem a uma tela.
- Evitar dezenas de `useState` no mesmo componente.
- Usar `useMemo` para filtros em listas médias.
- Usar virtualização para listas grandes.
- Usar `useCallback` quando handlers forem passados para muitos filhos.
- Usar `React.memo` em cards repetidos de Kanban/lista.
- Evitar filtros/map/reduce repetidos dentro do JSX.

Kanban:

- Renderizar por página ou virtualizar.
- Cada coluna deve receber lista já agrupada.
- Não fazer `array.filter` por coluna dentro do render para cada coluna.
- Cards devem ser componentes memoizados.
- DnD deve ser carregado apenas na rota Kanban.

Listas:

- Paginação server-side obrigatória.
- Busca server-side para grandes volumes.
- Infinite scroll apenas se houver bom controle de cache.

---

## Realtime

Realtime deve ser usado com cuidado.

Regras:

- Escopo por `organization_id`.
- Não recarregar a lista inteira em todo evento.
- Aplicar delta no cache quando possível.
- Se precisar invalidar, fazer debounce global.
- Não criar múltiplos channels para o mesmo dado na mesma tela.
- Remover channel no cleanup.

Errado:

```ts
on("postgres_changes", ..., () => loadData())
```

Certo:

```ts
on("postgres_changes", ..., (payload) => {
  queryClient.setQueryData(key, old => applyDelta(old, payload))
})
```

Se a tela for complexa, usar:

- debounce de 500ms a 1500ms
- invalidar só a query afetada
- jamais recarregar dashboard inteiro por mudança pequena

---

## Integrações externas

Toda integração deve passar pelo backend.

Inclui:

- WhatsApp
- Evolution API
- UAZAPI
- n8n
- Google Calendar
- envio de mensagens
- webhooks de automação

Proibido:

- URL de webhook hardcoded no componente.
- Chamar webhook externo diretamente do browser.
- Enviar payload com todos os dados do lead sem minimização.

Obrigatório:

- Variáveis de ambiente server-side.
- Assinatura/HMAC quando possível.
- Retry com backoff.
- Idempotency key.
- Audit log.
- Fila ou tabela de jobs para operações demoradas.
- Sanitização de payload.
- Timeout curto.

Modelo sugerido:

- `integration_jobs`
- `integration_logs`
- worker/cron para reprocessar falhas

---

## UX e carregamento

Obrigatório:

- Skeletons por seção.
- Loading não bloqueante.
- Optimistic update com rollback em ações simples.
- Feedback visual claro.
- Estados vazios úteis.
- Paginação ou busca incremental.
- Modais leves, carregados sob demanda.

Evitar:

- Spinner global em tela inteira para qualquer ação.
- Recarregar página/lista inteira após editar um item.
- Renderizar todos os cards ao abrir a tela.
- Bloquear navegação enquanto dashboard calcula.

---

## Observabilidade

Implementar desde o início:

- `audit_logs`
- logs estruturados no servidor
- métricas de tempo de query
- métricas de tempo de renderização em telas críticas
- monitoramento de web vitals
- monitoramento de erros client/server
- contagem de chamadas externas
- alertas para falhas de integração

Toda ação crítica deve gerar audit log:

- criar lead
- mover estágio
- excluir/arquivar
- alterar usuário/permissão
- enviar webhook
- registrar venda
- alterar agendamento

---

## Performance budget

Defina estes limites:

- Tela inicial autenticada: carregar em até 2s em conexão comum.
- Interação de filtro: resposta visual em até 100ms para dados em memória.
- Busca remota: debounce 300ms a 500ms.
- Listas: máximo 50 itens renderizados por página sem virtualização.
- Kanban: máximo 20 a 30 cards visíveis por coluna antes de "carregar mais".
- Dashboard: nunca buscar linhas brutas quando métrica agregada resolve.
- Bundle por rota: evitar carregar DnD, charts e editor rico fora das telas onde são usados.

---

## Plano de implementação seguro

Antes de codar:

1. Desenhe arquitetura.
2. Defina schema.
3. Defina RLS.
4. Defina permissões.
5. Defina fluxos principais.
6. Defina performance budget.
7. Defina estrutura de pastas.
8. Defina endpoints/server actions.
9. Defina plano de testes.

Depois implemente em fases:

### Fase 1 - Base

- Auth
- Organizations
- Members
- Roles/permissions
- Layout autenticado
- RLS testável

### Fase 2 - CRM

- Leads
- Kanban
- Histórico
- Agendamentos
- Estoque/catálogo básico

### Fase 3 - Dashboard

- RPC/views agregadas
- Métricas por período
- Gráficos com lazy loading

### Fase 4 - Integrações

- WhatsApp/webhooks
- Jobs
- Logs
- Retry
- Idempotência

### Fase 5 - ERP opcional

- Clientes
- Contratos
- Serviços
- Financeiro
- Estoque
- Documentos privados

---

## Testes obrigatórios

Crie testes para:

- RLS: usuário de um tenant não lê outro tenant.
- Permissões: usuário sem permissão não muta dados.
- Queries: listagens paginam corretamente.
- Realtime: evento atualiza apenas item afetado.
- Dashboard: métricas batem com dados de origem.
- Webhook: retry e idempotência funcionam.
- Soft delete: item some da UI sem perder audit log.

Inclua também testes manuais:

- login/logout
- criar lead
- mover lead no Kanban
- filtrar lista
- criar agendamento
- registrar venda/perda
- abrir dashboard
- trocar de tenant se aplicável

---

## Entrega esperada do agente

Ao responder, entregue primeiro:

1. Arquitetura proposta.
2. Modelo de dados.
3. RLS/policies.
4. Estrutura de pastas.
5. Fluxos principais.
6. Plano de performance.
7. Plano de segurança.
8. Plano de implementação por fases.
9. Riscos e decisões técnicas.

Somente depois comece a implementar.

Durante a implementação:

- Criar arquivos pequenos.
- Evitar componentes monolíticos.
- Evitar `select("*")`.
- Usar server-side para operações sensíveis.
- Validar tenant em toda mutação.
- Adicionar skeleton/loading por seção.
- Adicionar paginação desde a primeira listagem.
- Não deixar TODOs críticos sem resolver.

---

## Checklist de aceite

O sistema só deve ser considerado pronto quando:

- Não houver autenticação própria com senha em tabela customizada.
- Não houver sessão/permissão baseada em localStorage.
- Todas as tabelas de negócio tiverem RLS.
- Todas as queries de negócio forem filtradas por tenant.
- Não houver `select("*")` em listagens.
- Dashboard não carregar linhas brutas para agregar no browser.
- Kanban/listas tiverem paginação ou virtualização.
- Realtime não recarregar tudo em cada evento.
- Webhooks não forem chamados diretamente pelo client.
- Buckets sensíveis não forem públicos.
- Logs não expuserem dados pessoais.
- Componentes críticos estiverem divididos e legíveis.
- Build e lint passarem.
- Testes de RLS e permissões passarem.

---

## Pedido final ao agente

Crie este sistema pensando em 10x, 100x e 1000x usuários.

Em cada decisão, explique como ela evita:

- lentidão
- travamento de navegação
- excesso de renderização
- vazamento entre tenants
- custo desnecessário de banco
- dificuldade de manutenção
- gargalos futuros

Não copie a arquitetura antiga. Use as funcionalidades como referência de produto, mas implemente com fundação nova, segura e escalável.
