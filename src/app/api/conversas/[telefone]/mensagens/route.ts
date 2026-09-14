import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUazapiCredentials } from '@/lib/conversas/credentials';
import { resolveLeadIdForTelefone, resolveSendTarget } from '@/lib/conversas/resolve-lead';
import { canAccessConversation } from '@/lib/conversas/access';
import { buildWhatsAppText, hashWhatsAppText } from '@/lib/conversas/message-signature';
import { markConversationMessageSent, queueConversationMessageReconciliation } from '@/lib/conversas/delivery-state';
import { markConversationReadAfterReply } from '@/lib/conversas/mark-replied-read';
import { sendUazapiText } from '@/lib/uazapi';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'A UAZAPI demorou para responder. Tente novamente.';
  }
  return error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.';
}

function isValidTelefone(value: string): boolean {
  return /^\d{8,13}$/.test(value);
}

export async function POST(request: Request, { params }: { params: { telefone: string } }) {
  const telefone = params.telefone;
  if (!isValidTelefone(telefone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { content?: unknown; clientMessageId?: unknown } | null;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const clientMessageId = typeof body?.clientMessageId === 'string' ? body.clientMessageId : randomUUID();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `A mensagem deve ter entre 1 e ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 422 });
  }
  if (!UUID_PATTERN.test(clientMessageId)) {
    return NextResponse.json({ error: 'Identificador da mensagem inválido.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!(await canAccessConversation(supabase, telefone))) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, assinatura_mensagens_ativa')
    .eq('id', userData.user.id)
    .maybeSingle();
  const senderProfile = profile as { nome: string | null; assinatura_mensagens_ativa: boolean } | null;
  const whatsappContent = buildWhatsAppText(content, senderProfile?.nome ?? null, senderProfile?.assinatura_mensagens_ativa !== false);
  if (whatsappContent.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `A mensagem com a assinatura deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 422 });
  }

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
  const leadId = await resolveLeadIdForTelefone(admin, telefone);
  const senderName = senderProfile?.nome ?? userData.user.email ?? null;
  const { data: inserted, error: insertError } = await admin
    .from('conversas_mensagens')
    .insert({
      lead_id: leadId,
      telefone_normalizado: telefone,
      chat_jid: target.chatJid,
      direcao: 'saida',
      conteudo: content,
      tipo: 'text',
      status: 'enviando',
      provider_content_hash: hashWhatsAppText(whatsappContent),
      client_message_id: clientMessageId,
      enviado_por_id: userData.user.id,
      enviado_por_nome: senderName,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    console.error('Falha ao registrar mensagem de saída.', { code: insertError?.code, telefone });
    return NextResponse.json({ error: 'Não foi possível preparar a mensagem para envio.' }, { status: 500 });
  }

  try {
    const credentials = await getUazapiCredentials(admin);
    const result = await sendUazapiText(credentials, target.number, whatsappContent);
    const deliveryStatePersisted = await markConversationMessageSent(admin, inserted.id, result.providerMessageId);
    if (!deliveryStatePersisted) {
      const queued = await queueConversationMessageReconciliation(admin, inserted.id, result.providerMessageId);
      console.error('Mensagem enviada, mas o estado de entrega ficou pendente de reconciliação.', { messageId: inserted.id, queued });
    }
    const readStatePersisted = await markConversationReadAfterReply(admin, telefone, userData.user.id, inserted.id);
    if (!readStatePersisted) {
      console.error('Mensagem enviada, mas não foi possível marcar a conversa como lida.', { messageId: inserted.id, telefone });
    }

    return NextResponse.json(
      {
        clientMessageId,
        status: 'enviado',
        providerMessageId: result.providerMessageId,
        historySyncPending: !deliveryStatePersisted,
        historyMessage: { id: inserted.id, direcao: 'saida', conteudo: content, tipo: 'text' },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = errorMessage(error);
    await admin.from('conversas_mensagens').update({ status: 'falhou', erro: message }).eq('id', inserted.id);
    return NextResponse.json({ error: message, clientMessageId }, { status: 502 });
  }
}
