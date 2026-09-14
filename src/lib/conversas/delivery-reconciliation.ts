import type { SupabaseClient } from '@supabase/supabase-js';
import { hashWhatsAppText } from './message-signature';

export async function findLocalMessageForProviderText(
  client: Pick<SupabaseClient, 'from'>,
  telefone: string,
  providerContent: string,
  providerTimestamp: number
): Promise<number | null> {
  if (!Number.isFinite(providerTimestamp) || providerTimestamp <= 0) return null;
  const from = new Date(providerTimestamp - 5 * 60_000).toISOString();
  const to = new Date(providerTimestamp + 5 * 60_000).toISOString();
  const { data, error } = await client
    .from('conversas_mensagens')
    .select('id')
    .eq('telefone_normalizado', telefone)
    .eq('direcao', 'saida')
    .eq('status', 'enviando')
    .eq('provider_content_hash', hashWhatsAppText(providerContent))
    .is('provider_message_id', null)
    .gte('created_at', from)
    .lte('created_at', to)
    .limit(2);

  if (error || data?.length !== 1) return null;
  return (data[0] as { id: number }).id;
}

export async function findLocalAudioMessageForProvider(
  client: Pick<SupabaseClient, 'from'>,
  telefone: string,
  providerTimestamp: number
): Promise<number | null> {
  if (!Number.isFinite(providerTimestamp) || providerTimestamp <= 0) return null;
  const from = new Date(providerTimestamp - 5 * 60_000).toISOString();
  const to = new Date(providerTimestamp + 5 * 60_000).toISOString();
  const { data, error } = await client
    .from('conversas_mensagens')
    .select('id')
    .eq('telefone_normalizado', telefone)
    .eq('direcao', 'saida')
    .eq('tipo', 'audio')
    .eq('status', 'enviando')
    .is('provider_message_id', null)
    .gte('created_at', from)
    .lte('created_at', to)
    .limit(2);

  if (error || data?.length !== 1) return null;
  return (data[0] as { id: number }).id;
}
