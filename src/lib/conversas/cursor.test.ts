import { describe, expect, it } from 'vitest';
import { decodeConversationCursor, encodeConversationCursor } from './cursor';

describe('conversation cursor', () => {
  it('faz round-trip de um cursor versionado', () => {
    const value = { at: '2026-08-27T12:34:56.000Z', phone: '1199999999' };
    expect(decodeConversationCursor(encodeConversationCursor(value))).toEqual(value);
  });

  it.each(['', '***', 'e30', Buffer.from(JSON.stringify({ v: 2, at: null, phone: '1' })).toString('base64url')])(
    'rejeita cursor inválido: %s',
    (cursor) => expect(() => decodeConversationCursor(cursor)).toThrow('Cursor inválido.')
  );
});
