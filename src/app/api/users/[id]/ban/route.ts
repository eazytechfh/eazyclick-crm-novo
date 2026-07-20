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

  // VENDEDORES não tem FK para profiles (é uma tabela separada, vinculada só pelo nome). Ao
  // desativar um vendedor, removemos o registro de lá para ele sair da fila de atendimento
  // (uazapi/bot não distribui mais leads pra ele). Ao reativar, recriamos o registro do zero
  // sempre como "espera" — ele entra no fim da fila, não na posição que tinha antes.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('cargo, nome')
    .eq('id', params.id)
    .single();

  const targetCargo = (targetProfile as { cargo: string; nome: string | null } | null)?.cargo;
  const targetNome = (targetProfile as { cargo: string; nome: string | null } | null)?.nome;

  if (targetCargo === 'vendedor' && targetNome) {
    if (desativar) {
      await admin.from('VENDEDORES').delete().eq('vendedor', targetNome);
    } else {
      const { data: existente } = await admin
        .from('VENDEDORES')
        .select('id')
        .eq('vendedor', targetNome)
        .maybeSingle();

      if (!existente) {
        const { data: authUser } = await admin.auth.admin.getUserById(params.id);
        const telefone = (authUser.user?.user_metadata as { telefone?: string } | undefined)?.telefone ?? null;

        await admin.from('VENDEDORES').insert({
          vendedor: targetNome,
          telefone,
          atender: 'espera',
          quantos_lead: 0,
        });
      }
    }
  }

  return NextResponse.json({ success: true, desativado: desativar });
}
