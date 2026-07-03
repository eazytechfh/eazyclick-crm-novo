import type { SupabaseClient } from '@supabase/supabase-js';

// Notifica (via webhook do n8n) que o cronômetro de 30min de "Em Negociação" de um lead
// venceu. Chamada tanto pela rota /api/negociacao/notificar (disparada pelo client assim que
// detecta o vencimento) quanto pelo cron /api/negociacao/processar-vencidas — por isso toda a
// idempotência mora na RPC reivindicar_notificacao_negociacao, não aqui.

interface LeadReivindicado {
  id: number;
  nome_lead: string;
  telefone: string;
  vendedor: string | null;
  negociacao_expira_em: string;
  negociacao_notificacao_tentativas: number;
}

export type NotificarNegociacaoResultado =
  | { notificado: false }
  | { notificado: true }
  | { erro: string; status: 500 | 502 };

export async function notificarNegociacaoVencida(
  adminClient: SupabaseClient,
  leadId: number
): Promise<NotificarNegociacaoResultado> {
  const { data: reivindicado, error: rpcError } = await adminClient
    .rpc('reivindicar_notificacao_negociacao', { p_lead_id: leadId })
    .maybeSingle();

  if (rpcError || !reivindicado) {
    // Não é erro: outro processo (outro navegador ou o cron) já reivindicou essa notificação,
    // ou o lead não está mais vencido/no estágio certo.
    return { notificado: false };
  }

  const lead = reivindicado as LeadReivindicado;
  const webhookUrl = process.env.N8N_NEGOCIACAO_WEBHOOK_URL;

  if (!webhookUrl) {
    // Marca a causa exata do erro na própria coluna: se alguém esquecer de configurar o .env,
    // o sistema documenta isso no banco em vez de falhar silenciosamente.
    const mensagem = 'N8N_NEGOCIACAO_WEBHOOK_URL não configurada no ambiente.';
    await adminClient
      .from('BASE_DE_LEADS')
      .update({ negociacao_notificacao_status: 'erro', negociacao_notificacao_erro: mensagem })
      .eq('id', leadId);
    return { erro: mensagem, status: 500 };
  }

  const { data: leadCompleto } = await adminClient
    .from('BASE_DE_LEADS')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();

  const payload = {
    evento: 'negociacao_vencida',
    id: lead.id,
    nome: lead.nome_lead,
    telefone: lead.telefone,
    vendedor: lead.vendedor,
    prazo: lead.negociacao_expira_em,
    tentativas: lead.negociacao_notificacao_tentativas,
    lead: leadCompleto ?? null,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const mensagem = `Webhook do n8n respondeu ${response.status}.`;
      await adminClient
        .from('BASE_DE_LEADS')
        .update({ negociacao_notificacao_status: 'erro', negociacao_notificacao_erro: mensagem })
        .eq('id', leadId);
      return { erro: mensagem, status: 502 };
    }
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao chamar o webhook do n8n.';
    await adminClient
      .from('BASE_DE_LEADS')
      .update({ negociacao_notificacao_status: 'erro', negociacao_notificacao_erro: mensagem })
      .eq('id', leadId);
    return { erro: mensagem, status: 502 };
  }

  await adminClient
    .from('BASE_DE_LEADS')
    .update({
      negociacao_notificado_em: new Date().toISOString(),
      negociacao_notificacao_status: 'enviado',
      negociacao_notificacao_erro: null,
    })
    .eq('id', leadId);

  return { notificado: true };
}
