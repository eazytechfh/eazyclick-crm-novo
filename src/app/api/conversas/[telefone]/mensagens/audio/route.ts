import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUazapiCredentials } from '@/lib/conversas/credentials';
import { resolveLeadIdForTelefone, resolveSendTarget } from '@/lib/conversas/resolve-lead';
import { canAccessConversation } from '@/lib/conversas/access';
import { markConversationMessageSent, queueConversationMessageReconciliation } from '@/lib/conversas/delivery-state';
import { markConversationReadAfterReply } from '@/lib/conversas/mark-replied-read';
import { sendUazapiMedia } from '@/lib/uazapi';
import type { ConversaAnexo } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidTelefone(value: string): boolean {
  return /^\d{8,13}$/.test(value);
}

export async function POST(request: Request, { params }: { params: { telefone: string } }) {
  const telefone = params.telefone;
  if (!isValidTelefone(telefone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!(await canAccessConversation(supabase, telefone))) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get('audio');
  const clientMessageId = String(formData?.get('clientMessageId') ?? randomUUID());
  const durationSeconds = Number(formData?.get('durationSeconds') ?? 0) || null;
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Áudio inválido.' }, { status: 422 });
  }
  if (!UUID_PATTERN.test(clientMessageId)) {
    return NextResponse.json({ error: 'Identificador da mensagem inválido.' }, { status: 400 });
  }

  const { data: profile } = await supabase.from('profiles').select('nome').eq('id', userData.user.id).maybeSingle();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('conversas_mensagens')
    .select('id, status, provider_message_id')
    .eq('client_message_id', clientMessageId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ clientMessageId, status: existing.status, providerMessageId: existing.provider_message_id, deduplicated: true });
  }

  const target = await resolveSendTarget(admin, telefone);
  if (!target) {
    return NextResponse.json({ error: 'Não foi possível determinar o número de WhatsApp desta conversa.' }, { status: 422 });
  }

  const mimeType = audio.type || 'audio/webm';
  const extension = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
  const storagePath = `${target.chatJid.replace(/[^a-zA-Z0-9@._-]/g, '_')}/saida-${clientMessageId}.${extension}`;
  const bytes = new Uint8Array(await audio.arrayBuffer());

  const { error: uploadError } = await admin.storage.from('conversas-midia').upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: 'Não foi possível preparar o áudio para envio.' }, { status: 500 });
  }
  const { data: signedUrlData, error: signedUrlError } = await admin.storage.from('conversas-midia').createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signedUrlError || !signedUrlData) {
    return NextResponse.json({ error: 'Não foi possível gerar a URL do áudio.' }, { status: 500 });
  }

  const anexo: ConversaAnexo = {
    mimeType,
    fileName: storagePath.split('/').pop() ?? 'audio',
    fileSize: bytes.byteLength,
    durationSeconds,
    storagePath,
  };
  const leadId = await resolveLeadIdForTelefone(admin, telefone);
  const senderName = (profile as { nome: string | null } | null)?.nome ?? userData.user.email ?? null;
  const { data: inserted, error: insertError } = await admin
    .from('conversas_mensagens')
    .insert({
      lead_id: leadId,
      telefone_normalizado: telefone,
      chat_jid: target.chatJid,
      direcao: 'saida',
      tipo: 'audio',
      anexo,
      status: 'enviando',
      client_message_id: clientMessageId,
      enviado_por_id: userData.user.id,
      enviado_por_nome: senderName,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Não foi possível preparar a mensagem para envio.' }, { status: 500 });
  }

  try {
    const credentials = await getUazapiCredentials(admin);
    const result = await sendUazapiMedia(credentials, target.number, { type: 'ptt', file: signedUrlData.signedUrl });
    const deliveryStatePersisted = await markConversationMessageSent(admin, inserted.id, result.providerMessageId);
    if (!deliveryStatePersisted) {
      const queued = await queueConversationMessageReconciliation(admin, inserted.id, result.providerMessageId);
      console.error('Áudio enviado, mas o estado de entrega ficou pendente de reconciliação.', { messageId: inserted.id, queued });
    }
    const readStatePersisted = await markConversationReadAfterReply(admin, telefone, userData.user.id, inserted.id);
    if (!readStatePersisted) {
      console.error('Áudio enviado, mas não foi possível marcar a conversa como lida.', { messageId: inserted.id, telefone });
    }
    return NextResponse.json(
      { clientMessageId, status: 'enviado', providerMessageId: result.providerMessageId, historySyncPending: !deliveryStatePersisted },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o áudio.';
    await admin.from('conversas_mensagens').update({ status: 'falhou', erro: message }).eq('id', inserted.id);
    return NextResponse.json({ error: message, clientMessageId }, { status: 502 });
  }
}
