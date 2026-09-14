import type { ConversationListItem } from '@/components/conversas/types';
import { sortConversationsByLastActivity } from './conversation-order';

export function upsertRealtimeConversation(
  current: ConversationListItem[],
  incoming: ConversationListItem,
  limit: number
): ConversationListItem[] {
  const next = current.filter((item) => item.telefoneNormalizado !== incoming.telefoneNormalizado);
  next.push(incoming);
  return sortConversationsByLastActivity(next).slice(0, Math.max(1, limit));
}
