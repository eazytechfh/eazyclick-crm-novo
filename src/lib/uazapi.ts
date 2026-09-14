import 'server-only';

const SEND_TIMEOUT_MS = 15_000;
const SEND_MEDIA_TIMEOUT_MS = 30_000;

export interface UazapiCredentials {
  baseUrl: string;
  token: string;
}

export interface UazapiMediaPayload {
  type: 'ptt' | 'audio' | 'image' | 'video' | 'document';
  file: string;
  caption?: string;
}

export interface UazapiSendResult {
  providerMessageId: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringAt(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    current = record(current)?.[segment];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function providerMessageId(body: unknown): string | null {
  for (const path of [
    ['messageid'],
    ['messageId'],
    ['id'],
    ['key', 'id'],
    ['message', 'id'],
    ['response', 'key', 'id'],
  ]) {
    const value = stringAt(body, path);
    if (value) return value;
  }
  return null;
}

// A base URL vem de app_settings (configurada por um admin_master), não de env vars — por isso
// os mesmos bloqueios de SSRF do CRM A se aplicam aqui (HTTPS obrigatório, sem IP privado).
function buildUazapiUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') {
    throw new Error('A URL da UAZAPI precisa usar HTTPS.');
  }
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1' ||
    /^10\./.test(url.hostname) ||
    /^192\.168\./.test(url.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
  ) {
    throw new Error('A URL da UAZAPI não pode apontar para uma rede privada.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${path}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function sendUazapiText(
  credentials: UazapiCredentials,
  number: string,
  text: string
): Promise<UazapiSendResult> {
  const response = await fetch(buildUazapiUrl(credentials.baseUrl, '/send/text'), {
    method: 'POST',
    headers: { token: credentials.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, text, linkPreview: false, readchat: true, delay: 0 }),
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details =
      stringAt(body, ['error']) ??
      stringAt(body, ['message']) ??
      `A UAZAPI respondeu com status ${response.status}.`;
    throw new Error(details);
  }
  return { providerMessageId: providerMessageId(body) };
}

export async function sendUazapiMedia(
  credentials: UazapiCredentials,
  number: string,
  media: UazapiMediaPayload
): Promise<UazapiSendResult> {
  const response = await fetch(buildUazapiUrl(credentials.baseUrl, '/send/media'), {
    method: 'POST',
    headers: { token: credentials.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      type: media.type,
      file: media.file,
      ...(media.caption ? { caption: media.caption } : {}),
      readchat: true,
      delay: 0,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_MEDIA_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details =
      stringAt(body, ['error']) ??
      stringAt(body, ['message']) ??
      `A UAZAPI respondeu com status ${response.status}.`;
    throw new Error(details);
  }
  return { providerMessageId: providerMessageId(body) };
}

// POST genérico para endpoints de consulta da UAZAPI (ex: /message/download) — reusa a mesma
// validação de URL de sendUazapiText/sendUazapiMedia.
export async function postUazapi(
  credentials: UazapiCredentials,
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(buildUazapiUrl(credentials.baseUrl, path), {
    method: 'POST',
    headers: { token: credentials.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`A UAZAPI respondeu com status ${response.status}.`);
  }
  return data;
}

// Baixa a midia direto da UAZAPI (URL assinada retornada no payload do webhook/mensagem) para
// re-hospedar no Storage do proprio CRM — e isso que evita depender da retencao da UAZAPI.
export async function downloadUazapiMedia(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('A URL de mídia da UAZAPI precisa usar HTTPS.');
  }
  const response = await fetch(parsed.toString(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(SEND_MEDIA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Não foi possível baixar a mídia da UAZAPI (status ${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return { bytes: new Uint8Array(buffer), contentType: response.headers.get('content-type') };
}
