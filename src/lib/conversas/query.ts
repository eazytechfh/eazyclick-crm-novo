export interface ListParams {
  query: string;
  stage: string;
  page: number;
  pageSize: number;
  cursor: string | null;
}

export function parseListParams(searchParams: URLSearchParams): ListParams {
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(searchParams.get('pageSize') ?? 30) || 30));
  const query = (searchParams.get('q') ?? '').trim();
  if (query.length > 120) throw new Error('Busca muito longa.');
  return {
    query,
    stage: (searchParams.get('stage') ?? '').trim(),
    page,
    pageSize,
    cursor: searchParams.get('cursor'),
  };
}

export interface MessageListParams {
  limit: number;
  beforeId: number | null;
  afterId: number | null;
}

export function parseMessageParams(searchParams: URLSearchParams): MessageListParams {
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 60) || 60));
  const beforeIdRaw = searchParams.get('beforeId');
  const afterIdRaw = searchParams.get('afterId');
  const beforeId = beforeIdRaw ? Number(beforeIdRaw) : null;
  const afterId = afterIdRaw ? Number(afterIdRaw) : null;
  if (beforeId !== null && afterId !== null) throw new Error('Use apenas um cursor.');
  if (beforeId !== null && (!Number.isInteger(beforeId) || beforeId <= 0)) {
    throw new Error('beforeId inválido.');
  }
  if (afterId !== null && (!Number.isInteger(afterId) || afterId <= 0)) {
    throw new Error('afterId inválido.');
  }
  return { limit, beforeId, afterId };
}
