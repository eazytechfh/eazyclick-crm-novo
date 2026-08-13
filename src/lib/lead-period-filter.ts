export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'personalizado' | 'todos';
export interface CustomDateRange { start: string; end: string; }
export interface DateBoundaries { start: Date; end: Date; }

function parseLocalDate(value: string, endOfDay: boolean): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

export function getCustomDateBoundaries(range: CustomDateRange): DateBoundaries | null {
  const start = parseLocalDate(range.start, false);
  const end = parseLocalDate(range.end, true);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultCustomDateRange(now = new Date()): CustomDateRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return { start: toLocalDateInputValue(start), end: toLocalDateInputValue(end) };
}

export function getPreviousDateBoundaries(range: DateBoundaries): DateBoundaries {
  const startDayUtc = Date.UTC(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const endDayUtc = Date.UTC(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  const calendarDays = Math.round((endDayUtc - startDayUtc) / 86_400_000) + 1;
  const end = new Date(range.start);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (calendarDays - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

