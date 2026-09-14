import { describe, expect, it } from 'vitest';
import type { ConversaMensagem } from '@/types/database';
import type { PendingConversationMessage } from './types';
import { reconcilePendingMessages } from './ConversasClient';

function persistedMessage(clientMessageId: string): ConversaMensagem {
  return {
    id: 10,
    lead_id: 1,
    telefone_normalizado: '11999999999',
    chat_jid: '11999999999@s.whatsapp.net',
    direcao: 'saida',
    conteudo: 'teste',
    tipo: 'text',
    anexo: null,
    status: 'enviado',
    provider_message_id: 'provider-1',
    provider_content_hash: null,
    client_message_id: clientMessageId,
    enviado_por_id: 'user-1',
    enviado_por_nome: 'Renan',
    erro: null,
    created_at: '2026-08-20T15:00:00Z',
    updated_at: '2026-08-20T15:00:00Z',
  };
}

describe('reconcilePendingMessages', () => {
  it('remove o balão otimista mesmo se o realtime chegar antes da resposta do envio', () => {
    const pending: PendingConversationMessage = {
      clientMessageId: 'client-1',
      content: 'teste',
      status: 'sending',
      error: null,
    };

    expect(reconcilePendingMessages([pending], [persistedMessage('client-1')])).toEqual([]);
  });

  it('não remove outra mensagem com o mesmo texto quando os identificadores diferem', () => {
    const pending: PendingConversationMessage = {
      clientMessageId: 'client-2',
      content: 'teste',
      status: 'sending',
      error: null,
    };

    expect(reconcilePendingMessages([pending], [persistedMessage('client-1')])).toEqual([pending]);
  });
});
