import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CARGOS_QUE_EXCLUEM = ['admin_master', 'admin', 'gerente'];

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const leadId = Number(params.id);
  if (!Number.isSafeInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('cargo')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (!profile || !CARGOS_QUE_EXCLUEM.includes(profile.cargo as string)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const { data: leadRemovido, error } = await supabase
    .from('BASE_DE_LEADS')
    .delete()
    .eq('id', leadId)
    .eq('id_empresa', 1)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Falha ao excluir lead:', error.code);
    return NextResponse.json({ error: 'Não foi possível excluir o lead.' }, { status: 500 });
  }
  if (!leadRemovido || leadRemovido.id !== leadId) {
    return NextResponse.json({ error: 'Lead não encontrado ou não removido.' }, { status: 404 });
  }
  return NextResponse.json({ id: leadRemovido.id });
}
