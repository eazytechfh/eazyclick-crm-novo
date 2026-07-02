import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Chamado pelo front (NegociacaoTimerWatcher) assim que o popup de "tempo esgotado" aparece
// para um lead. Usa o admin client para reivindicar a notificação de forma atômica — o update
// só afeta a linha se negociacao_notificado_em ainda estiver null, então mesmo que vários
// navegadores detectem o vencimento ao mesmo tempo, o webhook do n8n só dispara uma vez.
export async function POST(request: Request) {
  const { leadId } = await request.json().catch(() => ({ leadId: null }));

  if (!leadId || typeof leadId !== 'number') {
    return NextResponse.json({ error: 'leadId inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: lead, error } = await admin
    .from('BASE_DE_LEADS')
    .update({ negociacao_notificado_em: agora })
    .eq('id', leadId)
    .eq('estagio_lead', 'em_negociacao')
    .is('negociacao_notificado_em', null)
    .lte('negociacao_expira_em', agora)
    .select('id, nome_lead, telefone, vendedor, negociacao_expira_em, negociacao_extensoes')
    .single();

  if (error || !lead) {
    // Não é erro: outro navegador já reivindicou essa notificação, ou o lead não está mais vencido.
    return NextResponse.json({ notificado: false });
  }

  const webhookUrl = process.env.N8N_NEGOCIACAO_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_lead: lead.id,
          nome_lead: lead.nome_lead,
          telefone: lead.telefone,
          vendedor: lead.vendedor,
          negociacao_expira_em: lead.negociacao_expira_em,
          negociacao_extensoes: lead.negociacao_extensoes,
        }),
      });
    } catch (webhookError) {
      console.error('Erro ao chamar webhook do n8n:', webhookError);
    }
  }

  return NextResponse.json({ notificado: true });
}
