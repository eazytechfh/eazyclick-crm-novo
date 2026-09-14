import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 20;

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  let query = supabase
    .from('BASE_DE_LEADS')
    .select('id,nome_lead,telefone,estagio_lead,veiculo_interesse,resumo_comercial')
    .not('telefone', 'is', null)
    .order('nome_lead', { ascending: true })
    .limit(MAX_RESULTS);
  if (q) {
    const digits = q.replace(/\D/g, '');
    query = digits ? query.or(`nome_lead.ilike.%${q}%,telefone.ilike.%${digits}%`) : query.ilike('nome_lead', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Não foi possível buscar os leads.' }, { status: 500 });
  }

  const items = (data ?? []).map((lead) => ({
    id: lead.id,
    name: lead.nome_lead,
    phone: lead.telefone,
    stage: lead.estagio_lead,
    vehicle: lead.veiculo_interesse,
    commercialSummary: lead.resumo_comercial,
  }));
  return NextResponse.json({ items });
}
