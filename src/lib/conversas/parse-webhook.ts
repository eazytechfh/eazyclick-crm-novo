// Parsing do payload cru do webhook "messages" da UAZAPI — portado do CRM A
// (src/app/api/webhooks/uazapi/route.ts), com deteccao de midia adicionada: o CRM A nao
// precisava disso porque lia o historico completo ao vivo da propria UAZAPI; aqui o webhook e
// a unica porta de entrada de mensagens, entao midia tambem precisa ser reconhecida e baixada
// (ver uazapi-media.ts).

type UnknownRecord = Record<string, unknown>;

export interface ParsedUazapiWebhookMessage {
  eventName: string;
  providerMessageId: string | null;
  chatJid: string | null;
  fromMe: boolean | null;
  wasSentByApi: boolean | null;
  isGroup: boolean;
  messageTimestamp: number | null;
  text: string | null;
  /** Presente quando a mensagem tem midia — o download real acontece via /message/download. */
  mimeTypeHint: string | null;
  captionHint: string | null;
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function valueAt(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    current = record(current)?.[segment];
  }
  return current;
}

function firstString(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function firstBoolean(value: unknown, paths: string[][]): boolean | null {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    if (typeof candidate === 'boolean') return candidate;
    if (candidate === 1 || candidate === '1' || candidate === 'true') return true;
    if (candidate === 0 || candidate === '0' || candidate === 'false') return false;
  }
  return null;
}

function messageFromPayload(payload: unknown): UnknownRecord {
  return (
    record(valueAt(payload, ['message'])) ??
    record(valueAt(payload, ['data', 'message'])) ??
    record(valueAt(payload, ['data'])) ??
    record(payload) ??
    {}
  );
}

function textFromMessage(message: UnknownRecord): string | null {
  const text = firstString(message, [
    ['text'],
    ['content', 'text'],
    ['content', 'conversation'],
    ['conversation'],
    ['caption'],
    ['extendedTextMessage', 'text'],
    ['message', 'conversation'],
    ['message', 'extendedTextMessage', 'text'],
  ]);
  if (text) return text;
  return typeof message.content === 'string' && message.content.trim() ? message.content.trim() : null;
}

function timestampFromMessage(message: UnknownRecord): number | null {
  for (const path of [['messageTimestamp'], ['timestamp'], ['message_timestamp']]) {
    const value = valueAt(message, path);
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function parseUazapiWebhookPayload(payload: unknown): ParsedUazapiWebhookMessage {
  const eventName = firstString(payload, [['event'], ['EventType'], ['type']])?.toLowerCase() ?? '';
  const message = messageFromPayload(payload);

  const fromMe = firstBoolean(message, [['fromMe'], ['from_me'], ['key', 'fromMe']]);
  const wasSentByApi = firstBoolean(message, [['wasSentByApi'], ['was_sent_by_api'], ['key', 'wasSentByApi']]);
  const chatJid = firstString(message, [['chatid'], ['chatId'], ['key', 'remoteJid'], ['remoteJid']]);
  const isGroup =
    firstBoolean(message, [['isGroup'], ['is_group']]) ?? chatJid?.endsWith('@g.us') ?? false;
  const providerMessageId = firstString(message, [
    ['messageid'],
    ['messageId'],
    ['id'],
    ['key', 'id'],
  ]);
  const mimeTypeHint = firstString(message, [['mimetype'], ['mimeType'], ['content', 'mimetype']]);

  return {
    eventName,
    providerMessageId,
    chatJid,
    fromMe,
    wasSentByApi,
    isGroup,
    messageTimestamp: timestampFromMessage(message),
    text: textFromMessage(message),
    mimeTypeHint,
    captionHint: firstString(message, [['caption']]),
  };
}
