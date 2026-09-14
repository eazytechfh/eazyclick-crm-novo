import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUazapiCredentials, UazapiNotConfiguredError } from '@/lib/conversas/credentials';
import { parseUazapiWebhookPayload } from '@/lib/conversas/parse-webhook';
import { prepareUazapiMediaDownload } from '@/lib/conversas/uazapi-media';
import { downloadUazapiMedia, postUazapi } from '@/lib/uazapi';
import type { ConversaAnexo, ConversaTipo } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_PAYLOAD_SIZE = 1_000_000;

function secureEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function tipoFromMimeType(mimeType: string): ConversaTipo {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    // Sem isto, uma excecao nao tratada em qualquer ponto acima vira um 500 do runtime sem
    // nenhuma linha de log com o prefixo [uazapi-webhook] — impossivel de achar nos logs do
    // Vercel entre todo o resto do trafego. Loga o erro real antes de responder.
    console.error('[uazapi-webhook] excecao nao tratada', error);
    return NextResponse.json({ error: 'Erro interno ao processar o webhook.' }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  console.log('[uazapi-webhook] hit', { url: request.url });

  const providedSecret = new URL(request.url).searchParams.get('secret') ?? '';
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from('app_settings')
    .select('uazapi_webhook_secret')
    .eq('id', 1)
    .single();
  const expectedSecret = (settings as { uazapi_webhook_secret: string | null } | null)?.uazapi_webhook_secret;

  if (settingsError) {
    console.error('[uazapi-webhook] app_settings indisponível', { message: settingsError.message });
    return NextResponse.json({ error: 'Webhook ainda não configurado.' }, { status: 503 });
  }
  if (!expectedSecret || !providedSecret || !secureEquals(providedSecret, expectedSecret)) {
    console.error('[uazapi-webhook] secret não bateu', {
      hasExpected: Boolean(expectedSecret),
      hasProvided: Boolean(providedSecret),
    });
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_PAYLOAD_SIZE) {
    console.error('[uazapi-webhook] payload inválido', { length: rawBody?.length ?? 0 });
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    console.error('[uazapi-webhook] JSON inválido', { rawBody: rawBody.slice(0, 500) });
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const parsed = parseUazapiWebhookPayload(payload);
  console.log('[uazapi-webhook] payload parseado', {
    eventName: parsed.eventName,
    isGroup: parsed.isGroup,
    fromMe: parsed.fromMe,
    wasSentByApi: parsed.wasSentByApi,
    chatJid: parsed.chatJid,
    providerMessageId: parsed.providerMessageId,
    hasText: Boolean(parsed.text),
    mimeTypeHint: parsed.mimeTypeHint,
    rawKeys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload as Record<string, unknown>) : null,
  });

  if (parsed.eventName !== 'messages') {
    console.log('[uazapi-webhook] ignorado: evento diferente de "messages"', { eventName: parsed.eventName });
    return NextResponse.json({ received: true, ignored: 'event' });
  }
  if (parsed.isGroup || parsed.wasSentByApi === true) {
    console.log('[uazapi-webhook] ignorado', { motivo: parsed.isGroup ? 'group' : 'outgoing_api' });
    return NextResponse.json({ received: true, ignored: parsed.isGroup ? 'group' : 'outgoing_api' });
  }
  if (!parsed.providerMessageId || !parsed.chatJid) {
    console.log('[uazapi-webhook] ignorado: sem providerMessageId/chatJid', {
      providerMessageId: parsed.providerMessageId,
      chatJid: parsed.chatJid,
    });
    return NextResponse.json({ received: true, ignored: 'unsupported_message' }, { status: 202 });
  }

  let tipo: ConversaTipo = 'text';
  let conteudo = parsed.text;
  let anexo: ConversaAnexo | null = null;

  if (parsed.mimeTypeHint) {
    try {
      const credentials = await getUazapiCredentials(admin);
      const prepared = await prepareUazapiMediaDownload(
        (path, body) => postUazapi(credentials, path, body),
        parsed.providerMessageId,
        credentials.baseUrl
      );
      if (prepared) {
        const { bytes, contentType } = await downloadUazapiMedia(prepared.url);
        const mimeType = contentType?.split(';', 1)[0]?.trim() || prepared.mimeType;
        tipo = tipoFromMimeType(mimeType);
        const storagePath = `${parsed.chatJid.replace(/[^a-zA-Z0-9@._-]/g, '_')}/${parsed.providerMessageId}/${prepared.fileName}`;
        const { error: uploadError } = await admin.storage
          .from('conversas-midia')
          .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
        if (uploadError) {
          console.error('Falha ao subir mídia recebida da UAZAPI.', { message: uploadError.message });
        } else {
          anexo = {
            mimeType,
            fileName: prepared.fileName,
            fileSize: bytes.byteLength,
            durationSeconds: null,
            storagePath,
          };
          conteudo = parsed.captionHint ?? parsed.text;
        }
      }
    } catch (error) {
      // Mensagem de mídia sem download disponível: ainda registra a mensagem (sem anexo) em vez
      // de descartá-la — o vendedor ao menos vê que algo chegou.
      console.error('Falha ao baixar mídia da UAZAPI.', {
        message: error instanceof UazapiNotConfiguredError ? error.message : 'download_failed',
      });
    }
  }

  if (!conteudo && !anexo) {
    console.log('[uazapi-webhook] ignorado: sem conteúdo nem anexo após tentativa de mídia');
    return NextResponse.json({ received: true, ignored: 'empty_message' }, { status: 202 });
  }

  // fromMe=true aqui significa "enviado pelo celular físico conectado", não pela API do CRM
  // (o caso wasSentByApi já foi descartado acima) — ainda assim é uma mensagem de saída.
  const { data: historyMessageId, error } = await admin.rpc('persistir_mensagem_uazapi_entrada', {
    p_provider_message_id: parsed.providerMessageId,
    p_chat_jid: parsed.chatJid,
    p_conteudo: conteudo,
    p_tipo: tipo,
    p_anexo: anexo,
    p_direcao: parsed.fromMe === true ? 'saida' : 'entrada',
  });
  if (error) {
    console.error('[uazapi-webhook] falha ao persistir mensagem', { code: error.code, message: error.message, details: error.details });
    return NextResponse.json({ error: 'Falha ao persistir mensagem.' }, { status: 500 });
  }
  console.log('[uazapi-webhook] mensagem persistida', { historyMessageId });

  return NextResponse.json({ received: true, historyMessageId });
}
