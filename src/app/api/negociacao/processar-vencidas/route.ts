import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificarNegociacaoVencida } from '@/lib/negociacao/notificacao';

// Endpoint para um cron externo (n8n agendado ou Vercel Cron) chamar periodicamente, sem
// depender de alguém com o CRM aberto no navegador para disparar a notificação de WhatsApp.
// Protegido por segredo de bearer token, não por sessão de usuário.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.NEGOCIACAO_PROCESSAR_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: leads, error } = await admin
    .from('BASE_DE_LEADS')
    .select('id')
    .eq('estagio_lead', 'em_negociacao')
    .not('negociacao_expira_em', 'is', null)
    .lte('negociacao_expira_em', agora)
    .is('negociacao_notificado_em', null)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultados = await Promise.all(
    (leads ?? []).map((lead) => notificarNegociacaoVencida(admin, (lead as { id: number }).id))
  );

  return NextResponse.json({
    processados: resultados.length,
    notificados: resultados.filter((r) => 'notificado' in r && r.notificado).length,
    erros: resultados.filter((r) => 'erro' in r).length,
  });
}
