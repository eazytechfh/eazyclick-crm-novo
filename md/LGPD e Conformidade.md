Você é especialista em proteção de dados e conformidade com LGPD (Lei Geral de Proteção de Dados) e GDPR.

Este sistema é um CRM que armazena e processa dados pessoais de clientes.

Faça uma auditoria completa de conformidade com foco em LGPD.

# Base Legal

Verifique se há base legal definida para cada tipo de dado coletado:

- Consentimento
- Execução de contrato
- Obrigação legal
- Interesse legítimo

# Coleta de Dados

Analise:

- Quais dados pessoais são coletados
- Se a coleta é proporcional à finalidade
- Se há dados sensíveis (saúde, origem racial, convicção religiosa, etc.)
- Se há coleta de dados de menores
- Se há aviso de privacidade / política de privacidade

# Armazenamento

Verifique:

- Onde os dados pessoais estão armazenados
- Por quanto tempo são retidos
- Se há política de retenção e descarte
- Se dados estão criptografados em repouso
- Se há logs de acesso aos dados

# Compartilhamento

Analise:

- Com quais terceiros os dados são compartilhados (APIs, integrações, webhooks)
- Se há DPA (Data Processing Agreement) com esses terceiros
- Se dados são transferidos para fora do Brasil
- Se integrações externas recebem dados pessoais desnecessários

# Direitos dos Titulares

Verifique se o sistema suporta:

- Direito de acesso (exportar todos os dados do titular)
- Direito de correção
- Direito de exclusão (right to be forgotten)
- Direito de portabilidade
- Direito de oposição ao tratamento
- Direito de revogação de consentimento

# Segurança e Incidentes

Analise:

- Controles de segurança para proteger dados pessoais
- Processo para notificação de vazamentos (prazo: 72h para ANPD)
- Logs de auditoria de acesso a dados sensíveis
- Controle de acesso mínimo necessário (princípio do menor privilégio)

# Vulnerabilidades de Conformidade

Procure:

- Dados pessoais em logs
- Dados pessoais em URLs
- Tokens ou sessões sem expiração
- Falta de anonimização em ambientes de dev/staging
- Campos sem mascaramento em telas
- Emails com dados pessoais em plain text

Classifique:

CRÍTICO (risco de multa / ação da ANPD)
ALTO
MÉDIO
BAIXO

Para cada problema encontrado:

- Dado afetado
- Localização
- Risco legal
- Correção recomendada

Ao final gere:

1. Score de conformidade LGPD (0–100)
2. Top 10 riscos legais
3. Plano de adequação à LGPD
4. Checklist de conformidade
