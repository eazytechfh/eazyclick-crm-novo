import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UazapiCredentials } from '@/lib/uazapi';
import { postUazapi, downloadUazapiMedia } from '@/lib/uazapi';
import { extractUazapiMessages, readUazapiPagination } from './uazapi-payload';
import { mapUazapiMessage } from './uazapi-message-map';
import { prepareUazapiMediaDownload } from './uazapi-media';
import type { ConversaAnexo, ConversaTipo } from '@/types/database';
import { findLocalAudioMessageForProvider, findLocalMessageForProviderText } from './delivery-reconciliation';
import { markConversationMessageSent, reconcileQueuedConversationMessage } from './delivery-state';
import { extractWhatsAppSignatureName, stripWhatsAppSignature } from './message-signature';
import { normalizarTelefone } from './phone';

const MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGES_PER_CHAT = 20_000;

export interface ImportChatResult {
  messagesProcessed: number;
  mediaDownloaded: number;
  mediaFailed: number;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9@._-]/g, '_');
}

// Núcleo reusado tanto pela importação em massa (um lead por vez) quanto pelo botão
// "Sincronizar histórico" de uma conversa aberta. Busca todas as mensagens de um chat via
// POST /message/find (paginado) e persiste cada uma pela mesma RPC do webhook — idempotente
// por provider_message_id, então rodar de novo sobre o mesmo lead não duplica nada.
export async function importChatHistory(
  admin: SupabaseClient,
  credentials: UazapiCredentials,
  chatJid: string
): Promise<ImportChatResult> {
  const post = (path: string, body: Record<string, unknown>) => postUazapi(credentials, path, body);
  const result: ImportChatResult = { messagesProcessed: 0, mediaDownloaded: 0, mediaFailed: 0 };

  let offset = 0;
  for (; offset < MAX_MESSAGES_PER_CHAT; ) {
    const response = await post('/message/find', { chatid: chatJid, limit: MESSAGE_PAGE_SIZE, offset });
    const rows = extractUazapiMessages(response);
    if (rows.length === 0) break;

    for (const row of rows) {
      const mapped = mapUazapiMessage(row);
      if (!mapped.providerMessageId || (!mapped.conteudo.trim() && !mapped.media)) continue;
      if (mapped.wasSentByApi && await reconcileQueuedConversationMessage(admin, mapped.providerMessageId)) {
        continue;
      }
      let conteudo = mapped.conteudo;
      const telefone = normalizarTelefone(chatJid.split('@')[0] ?? '');
      if (mapped.wasSentByApi && mapped.tipo === 'text') {
        const localMessageId = telefone
          ? await findLocalMessageForProviderText(admin, telefone, mapped.conteudo, mapped.timestamp)
          : null;
        if (localMessageId !== null) {
          await markConversationMessageSent(admin, localMessageId, mapped.providerMessageId);
          continue;
        }
        const signatureName = extractWhatsAppSignatureName(conteudo);
        if (signatureName) {
          const { data: knownSender } = await admin.from('profiles').select('id').eq('nome', signatureName).limit(1);
          if (knownSender?.length) conteudo = stripWhatsAppSignature(conteudo);
        }
      } else if (mapped.wasSentByApi && mapped.tipo === 'audio' && telefone) {
        const localMessageId = await findLocalAudioMessageForProvider(admin, telefone, mapped.timestamp);
        if (localMessageId !== null) {
          await markConversationMessageSent(admin, localMessageId, mapped.providerMessageId);
          continue;
        }
      }

      let tipo: ConversaTipo = mapped.tipo === 'text' || mapped.tipo === 'unknown' ? 'text' : (mapped.tipo as ConversaTipo);
      let anexo: ConversaAnexo | null = null;

      if (mapped.media) {
        try {
          const prepared = await prepareUazapiMediaDownload(post, mapped.providerMessageId, credentials.baseUrl);
          if (prepared) {
            const { bytes, contentType } = await downloadUazapiMedia(prepared.url);
            const mimeType = contentType?.split(';', 1)[0]?.trim() || prepared.mimeType;
            const storagePath = `${sanitizePathSegment(chatJid)}/historico/${mapped.providerMessageId}/${prepared.fileName}`;
            const { error: uploadError } = await admin.storage
              .from('conversas-midia')
              .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
            if (!uploadError) {
              anexo = {
                mimeType,
                fileName: prepared.fileName,
                fileSize: bytes.byteLength,
                durationSeconds: mapped.media.durationSeconds,
                storagePath,
              };
              result.mediaDownloaded += 1;
            } else {
              result.mediaFailed += 1;
            }
          } else {
            result.mediaFailed += 1;
          }
        } catch {
          result.mediaFailed += 1;
        }
        if (!anexo) tipo = 'text'; // sem mídia baixada, mantém só a legenda/texto (se houver)
      }

      const { error } = await admin.rpc('persistir_mensagem_uazapi_entrada', {
        p_provider_message_id: mapped.providerMessageId,
        p_chat_jid: chatJid,
        p_conteudo: conteudo || null,
        p_tipo: tipo,
        p_anexo: anexo,
        p_direcao: mapped.fromMe ? 'saida' : 'entrada',
        p_created_at: mapped.timestamp ? new Date(mapped.timestamp).toISOString() : null,
      });
      if (!error) result.messagesProcessed += 1;
    }

    const pagination = readUazapiPagination(response);
    if (!pagination.hasMore) break;
    offset = pagination.nextOffset ?? offset + rows.length;
  }

  return result;
}
