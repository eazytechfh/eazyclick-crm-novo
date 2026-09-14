import { describe, expect, it } from 'vitest';
import type { ConversationListItem } from '@/components/conversas/types';
import { sortConversationsByLastActivity } from './conversation-order';

function conversation(
  telefoneNormalizado: string,
  lastMessageEm: string | null,
  unreadCount: number
): ConversationListItem {
  return {
    telefoneNormalizado,
    leadId: null,
    name: telefoneNormalizado,
    phone: telefoneNormalizado,
    stage: null,
    vehicle: null,
    commercialSummary: null,
    isVendor: false,
    lastMessageId: null,
    lastMessage: null,
    lastMessageTipo: null,
    lastMessageEm,
    unreadCount,
  };
}

describe('sortConversationsByLastActivity', () => {
  it('mantém a atividade mais recente primeiro sem promover conversas não lidas', () => {
    const items = [
      conversation('11900000001', '2026-08-20T12:00:00Z', 23),
      conversation('11900000002', '2026-08-20T14:00:00Z', 0),
      conversation('11900000003', '2026-08-20T13:00:00Z', 8),
    ];

    expect(sortConversationsByLastActivity(items).map((item) => item.telefoneNormalizado)).toEqual([
      '11900000002',
      '11900000003',
      '11900000001',
    ]);
  });

  it('usa o telefone como desempate estável e deixa conversas sem data no final', () => {
    const items = [
      conversation('11900000003', null, 0),
      conversation('11900000002', '2026-08-20T14:00:00Z', 5),
      conversation('11900000001', '2026-08-20T14:00:00Z', 0),
    ];

    expect(sortConversationsByLastActivity(items).map((item) => item.telefoneNormalizado)).toEqual([
      '11900000001',
      '11900000002',
      '11900000003',
    ]);
  });

  it('não altera o array recebido', () => {
    const items = [
      conversation('11900000002', '2026-08-20T12:00:00Z', 0),
      conversation('11900000001', '2026-08-20T14:00:00Z', 0),
    ];

    sortConversationsByLastActivity(items);

    expect(items.map((item) => item.telefoneNormalizado)).toEqual(['11900000002', '11900000001']);
  });

  it('preserva a precisão de microssegundos do timestamp do banco', () => {
    const items = [
      conversation('11900000001', '2026-08-20T14:00:00.000001+00:00', 0),
      conversation('11900000002', '2026-08-20T14:00:00.000002+00:00', 0),
    ];

    expect(sortConversationsByLastActivity(items).map((item) => item.telefoneNormalizado)).toEqual([
      '11900000002',
      '11900000001',
    ]);
  });
});
