import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const WEBHOOK_URL = 'https://n8n.eazy.tec.br/webhook/resumo-comercial-crm';
const WEBHOOK_TIMEOUT_MS = 15_000;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const leadId = Number(params.id);
  if (!Number.isSafeInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { data: lead, error } = await supabase
    .from('BASE_DE_LEADS')
    .select('id, telefone')
    .eq('id', leadId)
    .eq('id_empresa', 1)
    .maybeSingle();

  if (error) {
    console.error('Falha ao consultar lead para gerar resumo:', error.code);
    return NextResponse.json({ error: 'Não foi possível consultar o lead.' }, { status: 500 });
  }
  if (!lead || lead.id !== leadId) {
    return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  }
  if (typeof lead.telefone !== 'string' || !lead.telefone.trim()) {
    return NextResponse.json({ error: 'O lead não possui telefone cadastrado.' }, { status: 422 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone: lead.telefone }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('Webhook de resumo recusou a solicitação:', response.status);
      return NextResponse.json(
        { error: 'O serviço de resumo não aceitou a solicitação.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (requestError) {
    const motivo = requestError instanceof Error ? requestError.name : 'erro_desconhecido';
    console.error('Falha ao chamar webhook de resumo:', motivo);
    return NextResponse.json(
      { error: 'Não foi possível acessar o serviço de resumo.' },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

