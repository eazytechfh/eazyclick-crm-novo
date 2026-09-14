import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toUazapiNumber, toWhatsAppJid } from './phone';

// Mesma regra usada pela RPC persistir_mensagem_uazapi_entrada: só associa quando exatamente
// um lead tem esse telefone_normalizado (evita associar errado quando o número é ambíguo).
export async function resolveLeadIdForTelefone(admin: SupabaseClient, telefoneNormalizado: string): Promise<number | null> {
  const { data, error } = await admin.from('BASE_DE_LEADS').select('id').eq('telefone_normalizado', telefoneNormalizado);
  if (error || !data || data.length !== 1) return null;
  return (data[0] as { id: number }).id;
}

export interface SendTarget {
  number: string;
  chatJid: string;
}

// telefone_normalizado é uma forma canônica (sem 55, sem o 9º dígito) — boa pra CASAR números,
// mas não é o número real pra enviar (um celular BR moderno precisa do 9). Por isso, antes de
// mandar mensagem, resolve o número de verdade a partir de uma fonte confiável: o chat_jid já
// usado pela UAZAPI nessa conversa (se já existe alguma mensagem) ou o telefone bruto do lead
// (tal como cadastrado, com o 9 preservado).
export async function resolveSendTarget(admin: SupabaseClient, telefoneNormalizado: string): Promise<SendTarget | null> {
  const { data: resumo } = await admin
    .from('conversas_resumo')
    .select('chat_jid')
    .eq('telefone_normalizado', telefoneNormalizado)
    .maybeSingle();
  const resumoChatJid = (resumo as { chat_jid: string } | null)?.chat_jid;
  if (resumoChatJid) {
    const number = resumoChatJid.split('@')[0];
    if (number) return { number, chatJid: resumoChatJid };
  }

  const { data: leads } = await admin.from('BASE_DE_LEADS').select('telefone').eq('telefone_normalizado', telefoneNormalizado);
  if (leads && leads.length === 1) {
    const number = toUazapiNumber((leads[0] as { telefone: string }).telefone);
    const chatJid = number ? toWhatsAppJid(number) : null;
    if (number && chatJid) return { number, chatJid };
  }

  return null;
}
