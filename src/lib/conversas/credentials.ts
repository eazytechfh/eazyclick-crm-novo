import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UazapiCredentials } from '@/lib/uazapi';

export class UazapiNotConfiguredError extends Error {
  constructor() {
    super('Credenciais da UAZAPI não configuradas (defina UAZAPI_TOKEN/UAZAPI_BASE_URL no Vercel ou em Configurações > Credenciais).');
    this.name = 'UazapiNotConfiguredError';
  }
}

// UAZAPI_TOKEN/UAZAPI_BASE_URL como env var no Vercel é a forma real usada em produção neste
// projeto (ver docs/ONBOARDING.md e .env.local.example) — prioridade sobre app_settings, que
// fica como fallback (dev local sem env var, ou troca pontual via Configurações > Credenciais).
export async function getUazapiCredentials(admin: SupabaseClient): Promise<UazapiCredentials> {
  const envToken = process.env.UAZAPI_TOKEN?.trim();
  const envBaseUrl = process.env.UAZAPI_BASE_URL?.trim();
  if (envToken && envBaseUrl) return { token: envToken, baseUrl: envBaseUrl };

  const { data, error } = await admin.from('app_settings').select('uazapi_token, uazapi_base_url').eq('id', 1).single();
  const settings = (error ? null : data) as { uazapi_token: string | null; uazapi_base_url: string | null } | null;
  const token = envToken || settings?.uazapi_token;
  const baseUrl = envBaseUrl || settings?.uazapi_base_url;
  if (!token || !baseUrl) throw new UazapiNotConfiguredError();
  return { token, baseUrl };
}
