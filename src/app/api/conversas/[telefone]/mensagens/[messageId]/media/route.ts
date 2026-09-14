import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConversaMensagem } from '@/types/database';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 120;

export async function GET(request: Request, { params }: { params: { telefone: string; messageId: string } }) {
  const telefone = params.telefone;
  const messageId = Number(params.messageId);
  if (!/^\d{8,13}$/.test(telefone) || !Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  // RLS de conversas_mensagens já garante que só volta a linha se o usuário pode ver esta conversa.
  const { data: message, error } = await supabase
    .from('conversas_mensagens')
    .select('id, telefone_normalizado, anexo')
    .eq('id', messageId)
    .eq('telefone_normalizado', telefone)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'Não foi possível carregar a mídia.' }, { status: 500 });
  }
  const anexo = (message as Pick<ConversaMensagem, 'anexo'> | null)?.anexo;
  if (!message || !anexo) {
    return NextResponse.json({ error: 'Mídia não encontrada.' }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get('download') === '1';
  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from('conversas-midia')
    .createSignedUrl(anexo.storagePath, SIGNED_URL_TTL_SECONDS, download ? { download: anexo.fileName || true } : undefined);
  if (signedError || !signed) {
    return NextResponse.json({ error: 'Não foi possível gerar a URL da mídia.' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
