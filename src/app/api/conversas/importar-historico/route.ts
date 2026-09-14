import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUazapiCredentials } from '@/lib/conversas/credentials';
import { postUazapi } from '@/lib/uazapi';
import { extractUazapiChats, isUazapiGroupChat, readUazapiPagination, uazapiChatId } from '@/lib/conversas/uazapi-payload';
import { importChatHistory } from '@/lib/conversas/import-history';

export const dynamic = 'force-dynamic';

// Itera todos os chats da UAZAPI (não só os leads já cadastrados no CRM — um CRM novo pode
// não ter nenhum lead ainda, e mesmo assim já existir histórico de conversas no WhatsApp
// conectado). Chats sem lead correspondente ficam com lead_id nulo em conversas_mensagens/
// conversas_resumo e são associados automaticamente depois, quando o lead for cadastrado
// (trigger reconciliar_mensagens_orfas na migration 0025).
const CHATS_PER_CALL = 5;
const MAX_MILLIS_PER_CALL = 20_000;

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

  const body = (await request.json().catch(() => ({}))) as { cursorOffset?: number };
  const cursorOffset = Number.isInteger(body.cursorOffset) && body.cursorOffset! >= 0 ? body.cursorOffset! : 0;

  const admin = createAdminClient();
  let credentials;
  try {
    credentials = await getUazapiCredentials(admin);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Credenciais não configuradas.' }, { status: 422 });
  }

  let chatsResponse: unknown;
  try {
    chatsResponse = await postUazapi(credentials, '/chat/find', { limit: CHATS_PER_CALL, offset: cursorOffset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível listar os chats.' }, { status: 502 });
  }
  const chats = extractUazapiChats(chatsResponse);
  const pagination = readUazapiPagination(chatsResponse);

  if (chats.length === 0) {
    return NextResponse.json({ done: true, nextCursorOffset: null, chatsProcessados: 0, totalChats: pagination.totalRecords, mensagensImportadas: 0, midiaBaixada: 0, midiaFalhou: 0 });
  }

  const startedAt = Date.now();
  let mensagensImportadas = 0;
  let midiaBaixada = 0;
  let midiaFalhou = 0;
  let chatsProcessados = 0;

  for (const chat of chats) {
    chatsProcessados += 1;
    if (isUazapiGroupChat(chat)) continue;
    const chatJid = uazapiChatId(chat);
    if (!chatJid) continue;
    try {
      const result = await importChatHistory(admin, credentials, chatJid);
      mensagensImportadas += result.messagesProcessed;
      midiaBaixada += result.mediaDownloaded;
      midiaFalhou += result.mediaFailed;
    } catch (error) {
      console.error('Falha ao importar histórico de um chat.', { chatJid, message: error instanceof Error ? error.message : 'erro' });
    }
    if (Date.now() - startedAt > MAX_MILLIS_PER_CALL) break;
  }

  const nextCursorOffset = cursorOffset + chatsProcessados;
  const done = chatsProcessados >= chats.length && chats.length < CHATS_PER_CALL;
  return NextResponse.json({
    done,
    nextCursorOffset: done ? null : nextCursorOffset,
    chatsProcessados,
    totalChats: pagination.totalRecords,
    mensagensImportadas,
    midiaBaixada,
    midiaFalhou,
  });
}
