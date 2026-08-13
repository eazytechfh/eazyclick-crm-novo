Você é especialista em arquiteturas SaaS multi-tenant.

Este sistema é um CRM onde múltiplos clientes (tenants) compartilham a mesma infraestrutura.

Faça uma auditoria completa do isolamento entre tenants.

# Isolamento de Dados

Verifique em cada tabela do banco:

- Existe coluna tenant_id / organization_id / account_id?
- Todas as queries filtram pelo tenant_id?
- Existe RLS (Row Level Security) ativado?
- As policies de RLS cobrem todas as operações (SELECT, INSERT, UPDATE, DELETE)?
- Há risco de um tenant acessar dados de outro?

Procure:

- Queries sem filtro de tenant
- JOINs que cruzam dados entre tenants
- Endpoints que não validam o tenant do usuário autenticado
- Funções/procedures que operam sem contexto de tenant

# Isolamento de Arquivos e Storage

Verifique:

- Arquivos de um tenant estão isolados por pasta/prefixo?
- URLs de arquivos são protegidas (não públicas sem autenticação)?
- Um tenant pode acessar arquivos de outro via URL manipulation?

# Isolamento de Processos

Analise:

- Jobs e workers processam dados de múltiplos tenants no mesmo contexto?
- Filas separam mensagens por tenant?
- Cache compartilhado pode vazar dados entre tenants?
- Webhooks e callbacks validam o tenant antes de processar?

# Limites e Quotas

Verifique se existe controle de:

- Número de registros por tenant
- Uso de storage por tenant
- Número de requisições por tenant (rate limiting)
- Consumo de operações de API externas por tenant

Sem limites, um tenant pode degradar a experiência de todos os outros.

# Onboarding e Offboarding

Analise:

- Como um novo tenant é criado? Há dados iniciais corretos?
- Como um tenant é removido? Os dados são completamente deletados?
- Há dados órfãos de tenants excluídos?

# Escalabilidade Multi-Tenant

Identifique:

- Tabelas sem índice em tenant_id (full table scan em todos os tenants)
- Queries que crescem O(n) com o número de tenants
- Gargalos quando um tenant tem volume muito maior que os demais (noisy neighbor)

Classifique:

CRÍTICO (vazamento de dados entre tenants)
ALTO
MÉDIO
BAIXO

Para cada problema encontrado:

- Tabela / Endpoint / Componente
- Tipo de vazamento ou risco
- Impacto
- Correção recomendada

Ao final gere:

1. Mapa de isolamento atual (o que está isolado vs. o que não está)
2. Top 10 riscos de vazamento entre tenants
3. Plano de hardening multi-tenant
4. Queries SQL para verificar políticas RLS em todas as tabelas
