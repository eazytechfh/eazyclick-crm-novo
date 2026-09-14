// Porta de lib/conversas/uazapi-message.ts do CRM A: interpreta uma linha crua de
// POST /message/find (usada só na importação de histórico — o webhook ao vivo usa
// parse-webhook.ts, que lê um payload de formato ligeiramente diferente).

type UnknownRecord = Record<string, unknown>;
type AttachmentKind = 'image' | 'audio' | 'video' | 'document';

export interface MappedUazapiMessage {
  providerMessageId: string | null;
  timestamp: number;
  fromMe: boolean;
  wasSentByApi: boolean;
  tipo: 'text' | AttachmentKind | 'sticker' | 'unknown';
  conteudo: string;
  media: { mimeType: string; fileName: string | null; fileSize: number | null; durationSeconds: number | null } | null;
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifierValue(value: unknown): string | null {
  const string = stringValue(value);
  if (string) return string;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function firstString(source: UnknownRecord | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(source?.[key]);
    if (value) return value;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function timestampMs(value: unknown): number {
  const numeric = finiteNumber(value);
  if (numeric !== null && numeric > 0) return numeric < 10_000_000_000 ? Math.trunc(numeric * 1_000) : Math.trunc(numeric);
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function messageTimestamp(payload: UnknownRecord): number {
  for (const key of ['messageTimestamp', 'message_timestamp', 'timestamp', 'createdAt', 'created_at']) {
    const value = timestampMs(payload[key]);
    if (value) return value;
  }
  return 0;
}

function providerMessageId(payload: UnknownRecord): string | null {
  const key = record(payload.key);
  for (const value of [payload.messageid, payload.messageId, payload.id, key?.id]) {
    const id = identifierValue(value);
    if (id) return id;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(normalized)) return true;
  if (['false', '0', 'no', 'não', 'nao'].includes(normalized)) return false;
  return null;
}

function fromMeFor(payload: UnknownRecord): boolean {
  const key = record(payload.key);
  for (const value of [payload.fromMe, payload.from_me, key?.fromMe]) {
    const parsed = booleanValue(value);
    if (parsed !== null) return parsed;
  }
  return false;
}

function wasSentByApiFor(payload: UnknownRecord): boolean {
  const key = record(payload.key);
  for (const value of [payload.wasSentByApi, payload.was_sent_by_api, key?.wasSentByApi]) {
    const parsed = booleanValue(value);
    if (parsed !== null) return parsed;
  }
  return false;
}

const ATTACHMENT_KINDS: AttachmentKind[] = ['image', 'audio', 'video', 'document'];

function kindFor(payload: UnknownRecord): { kind: MappedUazapiMessage['tipo']; media: UnknownRecord | null } {
  const nestedKinds: Array<[string, MappedUazapiMessage['tipo']]> = [
    ['imageMessage', 'image'],
    ['audioMessage', 'audio'],
    ['videoMessage', 'video'],
    ['documentMessage', 'document'],
    ['stickerMessage', 'sticker'],
  ];
  for (const [key, kind] of nestedKinds) {
    const nested = record(payload[key]);
    if (nested) return { kind, media: nested };
  }

  const source = firstString(payload, ['messageType', 'type'])?.toLowerCase() ?? '';
  const mimetypeHint = firstString(payload, ['mimetype', 'mimeType']);
  if (mimetypeHint) {
    const kind = (['image', 'audio', 'video'] as const).find((candidate) => mimetypeHint.startsWith(candidate)) ?? 'document';
    return { kind, media: payload };
  }
  const kinds: Array<[string, MappedUazapiMessage['tipo']]> = [
    ['image', 'image'], ['audio', 'audio'], ['video', 'video'], ['document', 'document'],
    ['sticker', 'sticker'], ['text', 'text'], ['conversation', 'text'], ['extendedtext', 'text'],
  ];
  for (const [needle, kind] of kinds) {
    if (source.includes(needle)) return { kind, media: null };
  }
  if (firstString(payload, ['body', 'text', 'message', 'content', 'conversation'])) return { kind: 'text', media: null };
  return { kind: 'unknown', media: null };
}

function textFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const source = record(value);
  if (!source) return null;
  const direct = firstString(source, ['body', 'text', 'message', 'conversation', 'caption']);
  if (direct) return direct;
  const content = textFrom(source.content);
  if (content) return content;
  for (const key of ['extendedTextMessage', 'imageMessage', 'audioMessage', 'videoMessage', 'documentMessage']) {
    const nested = textFrom(record(source[key]));
    if (nested) return nested;
  }
  return null;
}

function validMimeType(value: string | null): string | null {
  if (!value || !/^[a-z0-9.+-]+\/[a-z0-9.+;= -]+$/i.test(value)) return null;
  return value.toLowerCase();
}

function mediaFor(kind: MappedUazapiMessage['tipo'], media: UnknownRecord | null): MappedUazapiMessage['media'] {
  if (!media || !ATTACHMENT_KINDS.includes(kind as AttachmentKind)) return null;
  const mimeType = validMimeType(firstString(media, ['mimetype', 'mimeType']));
  if (!mimeType) return null;
  return {
    mimeType,
    fileName: firstString(media, ['fileName', 'file_name', 'filename']),
    fileSize: nonNegativeNumber(media.fileLength ?? media.fileSize ?? media.size),
    durationSeconds: nonNegativeNumber(media.seconds ?? media.durationSeconds ?? media.duration),
  };
}

export function mapUazapiMessage(payload: unknown): MappedUazapiMessage {
  const source = record(payload) ?? {};
  const { kind, media } = kindFor(source);
  return {
    providerMessageId: providerMessageId(source),
    timestamp: messageTimestamp(source),
    fromMe: fromMeFor(source),
    wasSentByApi: wasSentByApiFor(source),
    tipo: kind,
    conteudo: textFrom(media) ?? textFrom(source) ?? '',
    media: mediaFor(kind, media),
  };
}
