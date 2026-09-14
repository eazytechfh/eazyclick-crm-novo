import type { SupabaseClient } from '@supabase/supabase-js';

export async function markConversationMessageSent(
  client: Pick<SupabaseClient, 'from'>,
  messageId: number,
  providerMessageId: string | null
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await client
      .from('conversas_mensagens')
      .update({ status: 'enviado', provider_message_id: providerMessageId })
      .eq('id', messageId);
    if (!error) return true;
  }
  return false;
}

export async function queueConversationMessageReconciliation(
  client: Pick<SupabaseClient, 'from'>,
  messageId: number,
  providerMessageId: string | null
): Promise<boolean> {
  if (!providerMessageId) return false;
  const { error } = await client.from('conversas_reconciliacao_envio').upsert(
    { provider_message_id: providerMessageId, message_id: messageId },
    { onConflict: 'provider_message_id' }
  );
  return !error;
}

/** Retorna true quando o provider ID pertence a um envio local, mesmo se o retry ainda falhar. */
export async function reconcileQueuedConversationMessage(
  client: Pick<SupabaseClient, 'from'>,
  providerMessageId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('conversas_reconciliacao_envio')
    .select('message_id')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (error || !data) return false;

  const messageId = (data as { message_id: number }).message_id;
  const persisted = await markConversationMessageSent(client, messageId, providerMessageId);
  if (persisted) {
    await client.from('conversas_reconciliacao_envio').delete().eq('provider_message_id', providerMessageId);
  }
  return true;
}
