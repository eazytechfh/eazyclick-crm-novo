import { describe, expect, it } from 'vitest';
import type { ConversationListItem } from '@/components/conversas/types';
import { upsertRealtimeConversation } from './realtime-list';

const item = (phone: string, at: string): ConversationListItem => ({
  telefoneNormalizado: phone, leadId: null, name: phone, phone, stage: null, vehicle: null,
  commercialSummary: null, isVendor: false, lastMessageId: 1, lastMessage: 'x',
  lastMessageTipo: 'text', lastMessageEm: at, unreadCount: 0,
});

describe('upsertRealtimeConversation', () => {
  it('insere, ordena e limita sem duplicar', () => {
    const old = item('11', '2026-01-01T00:00:00Z');
    const recent = item('22', '2026-02-01T00:00:00Z');
    expect(upsertRealtimeConversation([old], recent, 1)).toEqual([recent]);
    expect(upsertRealtimeConversation([recent], { ...recent, lastMessage: 'nova' }, 30)[0].lastMessage).toBe('nova');
  });
});
