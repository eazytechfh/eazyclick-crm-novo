import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Cria um lead pra cada conversa sem lead correspondente, em lotes pequenos (mesmo motivo da
// importação de histórico: nunca esbarrar no limite de execução da rota). A trigger
// reconciliar_mensagens_orfas (migration 0025) associa automaticamente as mensagens já
// existentes ao lead recém-criado — não precisa fazer nada além do insert aqui.
const CONTATOS_PER_CALL = 20;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const { data: profile } = await supabase.from('profiles').select('cargo').eq('id', userData.user.id).maybeSingle();
  if ((profile as { cargo: string } | null)?.cargo !== 'admin_master') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: vendorRows } = await admin.from('VENDEDORES').select('telefone');
  const vendorPhones = new Set(
    ((vendorRows ?? []) as { telefone: string | null }[]).map((v) => (v.telefone ?? '').replace(/\D/g, '')).filter(Boolean)
  );

  const { data: contatos, error: contatosError } = await admin
    .from('conversas_resumo')
    .select('telefone_normalizado, chat_jid')
    .is('lead_id', null)
    .limit(CONTATOS_PER_CALL);
  if (contatosError) {
    return NextResponse.json({ error: 'Não foi possível listar os contatos.' }, { status: 500 });
  }
  if (!contatos || contatos.length === 0) {
    return NextResponse.json({ done: true, cadastrados: 0, restantes: 0 });
  }

  let cadastrados = 0;
  for (const contato of contatos as { telefone_normalizado: string; chat_jid: string }[]) {
    const numeroBruto = contato.chat_jid.split('@')[0]?.replace(/\D/g, '') ?? contato.telefone_normalizado;
    if (vendorPhones.has(numeroBruto)) continue; // vendedor não vira lead

    const { error: insertError } = await admin.from('BASE_DE_LEADS').insert({
      id_empresa: 1,
      nome_lead: numeroBruto,
      telefone: numeroBruto,
      origem: 'whatsapp',
      estagio_lead: 'oportunidade',
    });
    if (!insertError) cadastrados += 1;
    else console.error('Falha ao cadastrar lead a partir de contato.', { telefone: contato.telefone_normalizado, code: insertError.code });
  }

  const { count: restantes } = await admin.from('conversas_resumo').select('telefone_normalizado', { count: 'exact', head: true }).is('lead_id', null);
  return NextResponse.json({ done: (restantes ?? 0) === 0, cadastrados, restantes: restantes ?? 0 });
}
