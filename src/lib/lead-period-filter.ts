export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'personalizado' | 'todos';

export interface CustomDateRange {
  start: string;
  end: string;
}

export interface DateBoundaries {
  start: Date;
  end: Date;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function daysAgo(now: Date, amount: number): Date {
  const result = new Date(now);
  result.setDate(result.getDate() - amount);
  return startOfLocalDay(result);
}

export function getDefaultCustomDateRange(now = new Date()): CustomDateRange {
  const end = startOfLocalDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return { start: formatDateInput(start), end: formatDateInput(end) };
}

export function getCustomDateBoundaries(range: CustomDateRange): DateBoundaries | null {
  const parsedStart = parseLocalDate(range.start);
  const parsedEnd = parseLocalDate(range.end);
  if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) return null;

  return {
    start: startOfLocalDay(parsedStart),
    end: endOfLocalDay(parsedEnd),
  };
}

export function getPreviousDateBoundaries(current: DateBoundaries): DateBoundaries {
  const startDay = startOfLocalDay(current.start);
  const endDay = startOfLocalDay(current.end);
  const dayCount = Math.round((Date.UTC(
    endDay.getFullYear(),
    endDay.getMonth(),
    endDay.getDate()
  ) - Date.UTC(
    startDay.getFullYear(),
    startDay.getMonth(),
    startDay.getDate()
  )) / 86_400_000) + 1;

  const previousEnd = new Date(startDay);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (dayCount - 1));

  return {
    start: startOfLocalDay(previousStart),
    end: endOfLocalDay(previousEnd),
  };
}

export function isLeadWithinPeriod(
  createdAt: string,
  periodo: Periodo,
  now = new Date(),
  customRange?: CustomDateRange
): boolean {
  if (periodo === 'todos') return true;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;

  if (periodo === 'personalizado') {
    if (!customRange) return false;
    const boundaries = getCustomDateBoundaries(customRange);
    return Boolean(boundaries && created >= boundaries.start && created <= boundaries.end);
  }

  if (periodo === 'ontem') {
    return created >= daysAgo(now, 1) && created < daysAgo(now, 0);
  }

  const amount = periodo === 'hoje' ? 0 : Number.parseInt(periodo, 10);
  return created >= daysAgo(now, amount);
}

