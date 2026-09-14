import type { SupabaseClient } from '@supabase/supabase-js';

type ConversationReadClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export async function persistConversationReadSnapshot(
  client: Pick<SupabaseClient, 'rpc'>,
  telefoneNormalizado: string,
  userId: string,
  ultimaMensagemLidaId: number,
  totalMensagens: number,
  updatedAt = new Date().toISOString()
): Promise<boolean> {
  try {
    const { error } = await client.rpc('marcar_conversa_lida', {
      p_telefone_normalizado: telefoneNormalizado,
      p_user_id: userId,
      p_ultima_mensagem_lida_id: ultimaMensagemLidaId,
      p_total_mensagens: totalMensagens,
      p_atualizado_em: updatedAt,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function markConversationReadAfterReply(
  client: ConversationReadClient,
  telefoneNormalizado: string,
  userId: string,
  replyMessageId: number,
  updatedAt = new Date().toISOString()
): Promise<boolean> {
  try {
    const { data: summary, error: summaryError } = await client
      .from('conversas_resumo')
      .select('total_mensagens,ultima_mensagem_id')
      .eq('telefone_normalizado', telefoneNormalizado)
      .maybeSingle();

    if (summaryError || !summary) return false;

    return persistConversationReadSnapshot(
      client,
      telefoneNormalizado,
      userId,
      summary.ultima_mensagem_id ?? replyMessageId,
      summary.total_mensagens,
      updatedAt
    );
  } catch {
    return false;
  }
}
