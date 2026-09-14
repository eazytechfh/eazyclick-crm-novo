export type MessageTextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

export function linkifyMessageText(content: string): MessageTextSegment[] {
  const result: MessageTextSegment[] = [];
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const value = raw.replace(/[),.;!?]+$/, '');
    if (!value) continue;
    let href: string;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      href = url.href;
    } catch {
      continue;
    }

    if (index > cursor) result.push({ type: 'text', value: content.slice(cursor, index) });
    result.push({ type: 'link', value, href });
    cursor = index + value.length;
  }

  if (cursor < content.length) result.push({ type: 'text', value: content.slice(cursor) });
  return result.length ? result : [{ type: 'text', value: content }];
}
