import 'server-only';

// Porta reduzida de lib/uazapi-media.ts do CRM A: em vez de servir de proxy ao vivo a cada
// visualizacao, aqui e usada uma unica vez no recebimento do webhook, para obter uma URL de
// download confiavel (via POST /message/download da UAZAPI) e entao baixar e re-hospedar o
// arquivo no Storage do proprio CRM.

export type UazapiPost = (path: string, body: Record<string, unknown>) => Promise<unknown>;

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const SAFE_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'application/msword', 'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export interface PreparedUazapiMediaDownload {
  url: string;
  mimeType: string;
  fileName: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(source: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(source?.[key]);
    if (value) return value;
  }
  return null;
}

function safeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host === 'localhost' || host.includes(':')) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return true;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return !(
    octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
    octets[0] >= 224 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function configuredUazapiHost(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && safeHostname(url.hostname)
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function allowedUazapiHost(hostname: string, baseUrl: string): boolean {
  const host = hostname.toLowerCase();
  return safeHostname(host) && (
    host === 'uazapi.com' || host.endsWith('.uazapi.com') || host === configuredUazapiHost(baseUrl)
  );
}

function safeMimeType(value: unknown): string | null {
  const mime = stringValue(value)?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
  return mime && SAFE_MEDIA_TYPES.has(mime) ? mime : null;
}

export function isAllowedUazapiMediaUrl(value: unknown, uazapiBaseUrl: string): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && allowedUazapiHost(url.hostname, uazapiBaseUrl);
  } catch {
    return false;
  }
}

export function isValidUazapiMessageId(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_ID_PATTERN.test(value);
}

// Lista de permissao em vez de bloqueio: qualquer coisa fora de letras/digitos ASCII, ponto,
// espaco, hifen e underscore vira "_" — isso ja remove de uma vez caracteres de controle e
// truques de bidi-override (usados para disfarcar a extensao real de um arquivo) sem precisar
// enumerar cada intervalo de codigo unicode.
const UNSAFE_FILENAME_CHAR = /[^a-zA-Z0-9._ -]/g;

export function sanitizeUazapiMediaFileName(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return 'media';
  const baseName = raw.split(/[\\/]/).pop() ?? '';
  const normalized = baseName
    .replace(UNSAFE_FILENAME_CHAR, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 128);
  return normalized || 'media';
}

function normalizeUazapiMediaDownload(payload: unknown, uazapiBaseUrl: string): PreparedUazapiMediaDownload | null {
  const root = record(payload);
  const source = record(root?.data) ?? root;
  const url = firstString(source, ['fileURL', 'fileUrl', 'url']);
  const mimeType = safeMimeType(firstString(source, ['mimetype', 'mimeType', 'contentType']));
  if (!url || !mimeType || !isAllowedUazapiMediaUrl(url, uazapiBaseUrl)) return null;
  return {
    url,
    mimeType,
    fileName: sanitizeUazapiMediaFileName(firstString(source, ['fileName', 'filename', 'file_name', 'name'])),
  };
}

export async function prepareUazapiMediaDownload(
  post: UazapiPost,
  messageId: string,
  uazapiBaseUrl: string
): Promise<PreparedUazapiMediaDownload | null> {
  if (!isValidUazapiMessageId(messageId)) return null;
  const downloadResponse = await post('/message/download', {
    id: messageId,
    return_link: true,
    return_base64: false,
  });
  return normalizeUazapiMediaDownload(downloadResponse, uazapiBaseUrl);
}
