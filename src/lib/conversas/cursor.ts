export interface ConversationCursor {
  at: string | null;
  phone: string;
}

export function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), 'utf8').toString('base64url');
}

export function decodeConversationCursor(value: string): ConversationCursor {
  try {
    if (!value) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const validDate = parsed.at === null || (typeof parsed.at === 'string' && Number.isFinite(Date.parse(parsed.at)));
    if (parsed.v !== 1 || !validDate || typeof parsed.phone !== 'string' || !/^\d{8,13}$/.test(parsed.phone)) throw new Error();
    return { at: parsed.at as string | null, phone: parsed.phone };
  } catch {
    throw new Error('Cursor inválido.');
  }
}
