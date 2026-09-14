import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUazapiCredentials } from '@/lib/conversas/credentials';
import { resolveSendTarget } from '@/lib/conversas/resolve-lead';
import { toWhatsAppJid } from '@/lib/conversas/phone';
import { importChatHistory } from '@/lib/conversas/import-history';
import { canAccessConversation } from '@/lib/conversas/access';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { telefone: string } }) {
  const telefone = params.telefone;
  if (!/^\d{8,13}$/.test(telefone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!(await canAccessConversation(supabase, telefone))) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const admin = createAdminClient();
  try {
    const credentials = await getUazapiCredentials(admin);
    const target = (await resolveSendTarget(admin, telefone)) ?? { chatJid: toWhatsAppJid(telefone) ?? '', number: telefone };
    if (!target.chatJid) {
      return NextResponse.json({ error: 'Não foi possível determinar o número de WhatsApp desta conversa.' }, { status: 422 });
    }
    const result = await importChatHistory(admin, credentials, target.chatJid);
    return NextResponse.json({ synced: true, mensagensImportadas: result.messagesProcessed, midiaBaixada: result.mediaDownloaded, midiaFalhou: result.mediaFailed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível sincronizar o histórico.' }, { status: 502 });
  }
}
