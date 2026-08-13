Você é um arquiteto especialista em integrações, automações, APIs e sistemas distribuídos.

Faça uma auditoria completa de todas as integrações e automações existentes neste projeto.

Objetivo:

Identificar gargalos, riscos operacionais, falhas silenciosas, dependências críticas e oportunidades de otimização.

Mapeie:

# Integrações

- APIs externas
- APIs internas
- Webhooks
- Serviços terceiros
- Plataformas de mensagens
- Gateways de pagamento
- ERPs
- CRMs
- Ferramentas de automação

# Fluxos

Documente:

Origem
↓
Processamento
↓
Transformação
↓
Destino

Para cada fluxo existente.

# Performance

Procure:

- Chamadas duplicadas
- Chamadas desnecessárias
- Processamentos repetidos
- Falta de cache
- Consultas redundantes
- Esperas desnecessárias
- Fluxos síncronos que poderiam ser assíncronos

# Confiabilidade

Procure:

- Falta de retry
- Falta de timeout
- Falta de tratamento de erro
- Falta de logs
- Falta de monitoramento
- Falta de fallback

# Escalabilidade

Simule:

- 10x volume
- 50x volume
- 100x volume

Identifique:

- Gargalos
- Filas saturadas
- APIs limitantes
- Custos crescentes

# Segurança

Analise:

- Tokens expostos
- Chaves expostas
- Webhooks sem validação
- Falta de autenticação
- Dados sensíveis trafegando

# Custos

Procure:

- Execuções desnecessárias
- Loops
- Processamentos redundantes
- Consumo excessivo de operações

Para cada problema encontrado:

- Localização
- Impacto
- Risco
- Correção recomendada

Classifique:

CRÍTICO
ALTO
MÉDIO
BAIXO

Ao final gere:

1. Mapa completo das integrações
2. Top 20 gargalos
3. Top 20 riscos operacionais
4. Oportunidades de redução de custo
5. Melhorias de confiabilidade
6. Roadmap de otimização