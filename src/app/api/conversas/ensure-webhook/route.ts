import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { UazapiNotConfiguredError } from '@/lib/conversas/credentials';
import { ensureUazapiWebhook, WebhookSetupError } from '@/lib/conversas/webhook-setup';

export const dynamic = 'force-dynamic';

// Chamado automaticamente (sem ação do usuário) ao abrir a aba Conversas, para garantir que o
// recebimento de mensagens da UAZAPI esteja sempre ativo — sem precisar de alguém lembrar de ir
// em Configurações e clicar em "Ativar recebimento" toda vez. Registro é idempotente na UAZAPI
// (action: 'add' apenas reafirma o mesmo endpoint), então repetir a cada abertura é seguro.
// Qualquer usuário autenticado pode disparar isso (não é uma ação sensível, só diz à UAZAPI para
// onde mandar webhooks); erros são engolidos silenciosamente do lado do vendedor comum — quem
// precisa ver o erro de configuração é o admin_master, na tela de Configurações.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const result = await ensureUazapiWebhook(admin, request.url);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebhookSetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UazapiNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : 'Não foi possível configurar o webhook.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
