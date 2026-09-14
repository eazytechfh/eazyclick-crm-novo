import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessConversation } from '@/lib/conversas/access';
import { getUazapiCredentials } from '@/lib/conversas/credentials';
import { markConversationMessageSent, queueConversationMessageReconciliation } from '@/lib/conversas/delivery-state';
import { markConversationReadAfterReply } from '@/lib/conversas/mark-replied-read';
import { validateOutgoingFile } from '@/lib/conversas/outgoing-file';
import { resolveLeadIdForTelefone, resolveSendTarget } from '@/lib/conversas/resolve-lead';
import { sendUazapiMedia } from '@/lib/uazapi';
import type { ConversaAnexo } from '@/types/database';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: { telefone: string } }) {
  const telefone = params.telefone;
  if (!/^\d{8,13}$/.test(telefone)) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!(await canAccessConversation(supabase, telefone))) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const clientMessageId = String(form?.get('clientMessageId') ?? randomUUID());
  if (!(file instanceof File) || !UUID.test(clientMessageId)) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 422 });
  const prepared = await validateOutgoingFile(file);
  if (!prepared) return NextResponse.json({ error: 'Formato inválido ou arquivo maior que 20 MB.' }, { status: 422 });
  const admin = createAdminClient();
  const { data: existing } = await admin.from('conversas_mensagens').select('status,provider_message_id').eq('client_message_id', clientMessageId).maybeSingle();
  if (existing) return NextResponse.json({ clientMessageId, status: existing.status, providerMessageId: existing.provider_message_id, deduplicated: true });
  const target = await resolveSendTarget(admin, telefone);
  if (!target) return NextResponse.json({ error: 'Número de WhatsApp não encontrado.' }, { status: 422 });
  const storagePath = `${target.chatJid.replace(/[^a-zA-Z0-9@._-]/g, '_')}/saida-${clientMessageId}-${prepared.fileName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from('conversas-midia').upload(storagePath, bytes, { contentType: prepared.mimeType });
  if (uploadError) return NextResponse.json({ error: 'Não foi possível preparar o arquivo.' }, { status: 500 });
  const { data: signed } = await admin.storage.from('conversas-midia').createSignedUrl(storagePath, 300);
  if (!signed) return NextResponse.json({ error: 'Não foi possível preparar o envio.' }, { status: 500 });
  const { data: profile } = await supabase.from('profiles').select('nome').eq('id', userData.user.id).maybeSingle();
  const anexo: ConversaAnexo = { mimeType: prepared.mimeType, fileName: prepared.fileName, fileSize: bytes.byteLength, durationSeconds: null, storagePath };
  const { data: inserted, error: insertError } = await admin.from('conversas_mensagens').insert({ lead_id: await resolveLeadIdForTelefone(admin, telefone), telefone_normalizado: telefone, chat_jid: target.chatJid, direcao: 'saida', tipo: prepared.tipo, anexo, status: 'enviando', client_message_id: clientMessageId, enviado_por_id: userData.user.id, enviado_por_nome: (profile as { nome: string | null } | null)?.nome ?? userData.user.email }).select('id').single();
  if (insertError || !inserted) return NextResponse.json({ error: 'Não foi possível preparar a mensagem.' }, { status: 500 });
  try {
    const result = await sendUazapiMedia(await getUazapiCredentials(admin), target.number, { type: prepared.tipo, file: signed.signedUrl });
    const persisted = await markConversationMessageSent(admin, inserted.id, result.providerMessageId);
    if (!persisted) await queueConversationMessageReconciliation(admin, inserted.id, result.providerMessageId);
    const readStatePersisted = await markConversationReadAfterReply(admin, telefone, userData.user.id, inserted.id);
    if (!readStatePersisted) console.error('Arquivo enviado, mas não foi possível marcar a conversa como lida.', { messageId: inserted.id, telefone });
    return NextResponse.json({ clientMessageId, status: 'enviado', providerMessageId: result.providerMessageId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.';
    await admin.from('conversas_mensagens').update({ status: 'falhou', erro: message }).eq('id', inserted.id);
    return NextResponse.json({ error: message, clientMessageId }, { status: 502 });
  }
}
