import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureUazapiWebhook, WebhookSetupError } from '@/lib/conversas/webhook-setup';

export const dynamic = 'force-dynamic';

// Backstop do Vercel Cron (ver vercel.json) para o recebimento de mensagens nunca ficar
// desativado por muito tempo mesmo se ninguém abrir a aba Conversas (que já dispara a mesma
// checagem via /api/conversas/ensure-webhook) — ex.: instância da UAZAPI reconectou e a UAZAPI
// zerou a configuração de webhook. Protegido por CRON_SECRET: a Vercel manda
// "Authorization: Bearer $CRON_SECRET" automaticamente quando essa env var está definida.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  try {
    const result = await ensureUazapiWebhook(admin, request.url);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebhookSetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Não foi possível configurar o webhook.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
