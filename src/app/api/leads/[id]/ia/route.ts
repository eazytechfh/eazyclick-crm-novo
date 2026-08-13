import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const leadId = Number(params.id);
  if (!Number.isSafeInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const ativo = (body as { ativo?: unknown } | null)?.ativo;
  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { data: leadAtualizado, error } = await supabase
    .from('BASE_DE_LEADS')
    .update({ bot_ativo: ativo })
    .eq('id', leadId)
    .eq('id_empresa', 1)
    .eq('bot_ativo', !ativo)
    .select('id, bot_ativo, bot_ativo_alterado_em')
    .maybeSingle();

  if (error) {
    console.error('Falha ao alterar IA do lead:', error.code);
    return NextResponse.json({ error: 'Não foi possível alterar o status da IA.' }, { status: 500 });
  }
  if (
    !leadAtualizado ||
    leadAtualizado.id !== leadId ||
    leadAtualizado.bot_ativo !== ativo ||
    typeof leadAtualizado.bot_ativo_alterado_em !== 'string' ||
    leadAtualizado.bot_ativo_alterado_em.length === 0
  ) {
    return NextResponse.json({ error: 'Lead não encontrado ou estado desatualizado.' }, { status: 404 });
  }

  return NextResponse.json(leadAtualizado);
}
