import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Confirma acesso usando somente consultas sujeitas a RLS. Isso deve acontecer antes de uma
 * rota usar o service_role, que por definição ignora as policies do usuário autenticado.
 */
export async function canAccessConversation(client: Pick<SupabaseClient, 'rpc'>, telefone: string): Promise<boolean> {
  const { data, error } = await client.rpc('pode_acessar_conversa', { p_telefone: telefone });
  return !error && data === true;
}
