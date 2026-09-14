// Porta reduzida de lib/conversas/uazapi-payload.ts do CRM A: paginação de POST /message/find
// e POST /chat/find — usados pela importação de histórico em massa (que itera todos os chats
// da UAZAPI, não só os leads já cadastrados, já que um CRM novo pode não ter nenhum lead ainda).

export type UazapiRecord = Record<string, unknown>;

export interface UazapiPagination {
  hasMore: boolean;
  nextOffset: number | null;
  totalRecords: number | null;
}

function record(value: unknown): UazapiRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UazapiRecord) : null;
}

function unwrapUazapiPayload(value: unknown): UazapiRecord | null {
  const root = record(value);
  return record(root?.data) ?? root;
}

export function extractUazapiMessages(value: unknown): UazapiRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is UazapiRecord => record(item) !== null);
  const payload = unwrapUazapiPayload(value);
  const rows = payload?.messages;
  if (!Array.isArray(rows)) return [];
  return rows.filter((item): item is UazapiRecord => record(item) !== null);
}

export function extractUazapiChats(value: unknown): UazapiRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is UazapiRecord => record(item) !== null);
  const payload = unwrapUazapiPayload(value);
  const rows = payload?.chats;
  if (!Array.isArray(rows)) return [];
  return rows.filter((item): item is UazapiRecord => record(item) !== null);
}

export function uazapiChatId(chat: UazapiRecord): string | null {
  for (const key of ['wa_chatid', 'chatid', 'jid', 'wa_fastid', 'id']) {
    const value = chat[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function isUazapiGroupChat(chat: UazapiRecord): boolean {
  const chatId = uazapiChatId(chat);
  return chat.wa_isGroup === true || chat.isGroup === true || Boolean(chatId?.endsWith('@g.us'));
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function readUazapiPagination(value: unknown): UazapiPagination {
  const root = record(value);
  const nested = record(root?.data);
  const containers = [nested, root].filter((item): item is UazapiRecord => item !== null);
  const paginations = containers.map((item) => record(item.pagination)).filter((item): item is UazapiRecord => item !== null);
  const values = [...containers, ...paginations];
  const hasMoreValue = values.map((item) => item.hasMore).find((item) => typeof item === 'boolean');
  const nextOffset = values.map((item) => finiteNonNegative(item.nextOffset)).find((item) => item !== null);
  const totalRecords = values.map((item) => finiteNonNegative(item.totalRecords)).find((item) => item !== null);
  return {
    hasMore: hasMoreValue === true,
    nextOffset: nextOffset ?? null,
    totalRecords: totalRecords ?? null,
  };
}
