import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUazapiCredentials } from './credentials';

const REQUEST_TIMEOUT_MS = 15_000;

export class WebhookSetupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function webhookUrl(originUrl: string, secret: string): URL {
  const configuredOrigin = process.env.UAZAPI_WEBHOOK_PUBLIC_URL?.trim();
  const url = configuredOrigin ? new URL(configuredOrigin) : new URL('/api/webhooks/uazapi', originUrl);
  if (configuredOrigin) url.pathname = '/api/webhooks/uazapi';
  url.search = '';
  url.hash = '';

  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
    throw new WebhookSetupError('O recebimento exige uma URL HTTPS pública. Configure UAZAPI_WEBHOOK_PUBLIC_URL no deploy.', 422);
  }
  url.searchParams.set('secret', secret);
  return url;
}

function providerWebhookUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new WebhookSetupError('A URL da UAZAPI precisa usar HTTPS.', 422);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/webhook`;
  url.search = '';
  url.hash = '';
  return url;
}

// Registra (idempotente) o webhook da UAZAPI apontando para este CRM. Chamado tanto pelo botão
// manual em Configurações quanto automaticamente (mount da aba Conversas + cron de backstop),
// para que o recebimento de mensagens não dependa de alguém lembrar de clicar em um botão.
export async function ensureUazapiWebhook(
  admin: SupabaseClient,
  originUrl: string
): Promise<{ configured: boolean; webhookUrl: string }> {
  const credentials = await getUazapiCredentials(admin);

  // uazapi_webhook_secret não tem equivalente em env var (é gerado aqui, não configurado por
  // fora) — continua vindo de app_settings, então essa coluna precisa da migration 0025 aplicada.
  const { data: settings, error: settingsError } = await admin
    .from('app_settings')
    .select('uazapi_webhook_secret, uazapi_webhook_last_url')
    .eq('id', 1)
    .single();
  if (settingsError || !settings) {
    throw new WebhookSetupError('Aplique a migration 0025 antes de ativar o recebimento.', 409);
  }
  const existingSecret = (settings as { uazapi_webhook_secret: string | null }).uazapi_webhook_secret;
  const lastRegisteredUrl = (settings as { uazapi_webhook_last_url: string | null }).uazapi_webhook_last_url;

  const secret = existingSecret ?? randomBytes(32).toString('hex');
  if (!existingSecret) {
    const { error: secretError } = await admin
      .from('app_settings')
      .update({ uazapi_webhook_secret: secret, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (secretError) {
      throw new WebhookSetupError('Não foi possível preparar a autenticação do webhook.', 500);
    }
  }

  const callbackUrl = webhookUrl(originUrl, secret);
  const callbackUrlString = `${callbackUrl.origin}${callbackUrl.pathname}${callbackUrl.search}`;

  // Sem esse cache, cada abertura da aba Conversas e cada execucao do cron chamavam a UAZAPI
  // com "action: add" mesmo quando nada mudou. A UAZAPI nao dedupe por URL — cada chamada cria
  // um webhook novo em vez de atualizar o existente — e isso, combinado com originUrl variando
  // entre deploys (preview/producao) quando UAZAPI_WEBHOOK_PUBLIC_URL nao esta configurada,
  // foi o que acumulou dezenas de webhooks mortos na conta da UAZAPI.
  if (lastRegisteredUrl === callbackUrlString) {
    return { configured: true, webhookUrl: `${callbackUrl.origin}${callbackUrl.pathname}` };
  }

  const response = await fetch(providerWebhookUrl(credentials.baseUrl), {
    method: 'POST',
    headers: { token: credentials.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      url: callbackUrl.toString(),
      events: ['messages'],
      excludeMessages: ['wasSentByApi', 'isGroupYes'],
      addUrlEvents: false,
      addUrlTypesMessages: false,
      action: 'add',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const providerError =
      (body as { error?: string; message?: string } | null)?.error ??
      (body as { error?: string; message?: string } | null)?.message ??
      `A UAZAPI respondeu com status ${response.status}.`;
    throw new WebhookSetupError(providerError, 502);
  }

  await admin
    .from('app_settings')
    .update({ uazapi_webhook_last_url: callbackUrlString, updated_at: new Date().toISOString() })
    .eq('id', 1);

  return { configured: true, webhookUrl: `${callbackUrl.origin}${callbackUrl.pathname}` };
}
