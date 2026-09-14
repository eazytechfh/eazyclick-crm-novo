import { createHash } from 'node:crypto';

export function buildWhatsAppText(content: string, senderName: string | null, enabled: boolean): string {
  const safeName = senderName?.replace(/[\r\n*]+/g, ' ').replace(/\s+/g, ' ').trim();
  return enabled && safeName ? `*${safeName}*\n${content}` : content;
}

export function hashWhatsAppText(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function stripWhatsAppSignature(content: string): string {
  return content.replace(/^\*[^*\r\n]+\*\r?\n/, '');
}

export function extractWhatsAppSignatureName(content: string): string | null {
  return /^\*([^*\r\n]+)\*\r?\n/.exec(content)?.[1]?.trim() || null;
}
