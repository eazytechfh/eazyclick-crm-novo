import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificarNegociacaoVencida } from '@/lib/negociacao/notificacao';

// Chamado pelo front (NegociacaoTimerWatcher) assim que detecta um lead vencido. Valida a sessão
// e a visibilidade do lead com o client normal (respeitando RLS) ANTES de escalar para o client
// admin — assim ninguém não autenticado, nem autenticado sem acesso ao lead, consegue forjar o
// disparo do webhook de WhatsApp para um lead qualquer.
export async function POST(request: Request) {
  const { leadId } = await request.json().catch(() => ({ leadId: null }));

  if (!leadId || typeof leadId !== 'number') {
    return NextResponse.json({ error: 'leadId inválido.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: lead } = await supabase
    .from('BASE_DE_LEADS')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const resultado = await notificarNegociacaoVencida(admin, leadId);

  if ('erro' in resultado) {
    return NextResponse.json({ error: resultado.erro }, { status: resultado.status });
  }

  return NextResponse.json(resultado);
}
