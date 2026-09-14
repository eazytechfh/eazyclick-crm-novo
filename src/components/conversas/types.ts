import type { BaseDeLeads, ConversaMensagem, ConversaTipo } from '@/types/database';

export interface ConversationListItem {
  telefoneNormalizado: string;
  leadId: number | null;
  name: string;
  phone: string;
  stage: string | null;
  vehicle: string | null;
  commercialSummary: string | null;
  /** true quando o telefone bate com um vendedor cadastrado (não é um contato pra virar lead). */
  isVendor: boolean;
  lastMessageId: number | null;
  lastMessage: string | null;
  lastMessageTipo: ConversaTipo | null;
  lastMessageEm: string | null;
  unreadCount: number;
}

export interface ConversationListResponse {
  items: ConversationListItem[];
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
  total: number | null;
  totalNaoCadastrados: number | null;
}

export interface ConversationMessagesResponse {
  messages: ConversaMensagem[];
  hasMore: boolean;
  oldestMessageId: number | null;
  newestMessageId: number | null;
  totalMessages: number | null;
  lead: BaseDeLeads | null;
}

export type PendingMessageStatus = 'sending' | 'sent' | 'failed';
export type PendingMessageKind = 'text' | 'audio' | 'file';

export interface PendingConversationMessage {
  clientMessageId: string;
  content: string;
  status: PendingMessageStatus;
  error: string | null;
  kind?: PendingMessageKind;
  audioUrl?: string | null;
  audioBlob?: Blob | null;
  durationSeconds?: number | null;
  fileBlob?: File | null;
}

export interface NewConversationLead {
  id: number;
  name: string;
  phone: string;
  stage: string | null;
  vehicle: string | null;
  commercialSummary: string | null;
}
