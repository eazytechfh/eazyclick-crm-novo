import type { ConversationListItem } from '@/components/conversas/types';

function messageTimestamp(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortConversationsByLastActivity(items: ConversationListItem[]): ConversationListItem[] {
  return [...items].sort((left, right) => {
    const timeDifference = messageTimestamp(right.lastMessageEm) - messageTimestamp(left.lastMessageEm);
    if (timeDifference !== 0) return timeDifference;
    if (left.lastMessageEm && right.lastMessageEm && left.lastMessageEm !== right.lastMessageEm) {
      return right.lastMessageEm.localeCompare(left.lastMessageEm);
    }
    return left.telefoneNormalizado.localeCompare(right.telefoneNormalizado);
  });
}
