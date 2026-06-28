import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('cargo')
    .eq('id', userData.user.id)
    .single();

  const cargo = (profile as { cargo: string } | null)?.cargo;
  if (cargo !== 'admin_master' && cargo !== 'admin' && cargo !== 'gerente') {
    return NextResponse.json({ error: 'Permissão insuficiente.' }, { status: 403 });
  }

  if (params.id === userData.user.id) {
    return NextResponse.json({ error: 'Você não pode desativar a própria conta.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const desativar = body.desativar !== false;

  const admin = createAdminClient();
  // ban_duration grande (~100 anos) é usado como "desativação" permanente, já que o Supabase
  // Auth não possui um campo nativo de "ativo/inativo" — apenas suspensão temporária por duração.
  // "none" remove o ban e reativa o login normalmente.
  const { error: authError } = await admin.auth.admin.updateUserById(params.id, {
    ban_duration: desativar ? '876000h' : 'none',
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ desativado: desativar })
    .eq('id', params.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, desativado: desativar });
}
