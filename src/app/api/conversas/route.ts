import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decodeConversationCursor, encodeConversationCursor } from '@/lib/conversas/cursor';
import { parseListParams } from '@/lib/conversas/query';
import type { ConversationListItem } from '@/components/conversas/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startedAt = performance.now();
  const supabase = createClient();

  try {
    const searchParams = new URL(request.url).searchParams;
    const params = parseListParams(searchParams);
    const cursor = params.cursor ? decodeConversationCursor(params.cursor) : null;
    const dbStartedAt = performance.now();
    const { data, error } = await supabase.rpc('listar_conversas_cursor', {
      p_limite: params.pageSize,
      p_cursor_em: cursor?.at ?? null,
      p_cursor_telefone: cursor?.phone ?? null,
      p_busca: params.query || null,
      p_etapa: params.stage || null,
      p_vendedor: searchParams.get('vendedor') || null,
      p_sem_lead: searchParams.get('filtro') === 'sem_lead',
    });
    const dbDuration = performance.now() - dbStartedAt;
    if (error) {
      const unauthenticated = error.code === '42501' && error.message.includes('Não autenticado');
      const forbidden = error.code === '42501' && !unauthenticated;
      return NextResponse.json(
        { error: unauthenticated ? 'Não autenticado.' : forbidden ? 'Filtro não permitido.' : 'Não foi possível carregar as conversas.' },
        { status: unauthenticated ? 401 : forbidden ? 403 : 500, headers: { 'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, app;dur=${(performance.now() - startedAt).toFixed(1)}` } }
      );
    }

    const result = (data ?? {}) as { items?: ConversationListItem[]; hasMore?: boolean };
    const items = result.items ?? [];
    const last = items.at(-1);
    const nextCursor = result.hasMore && last
      ? encodeConversationCursor({ at: last.lastMessageEm, phone: last.telefoneNormalizado })
      : null;
    return NextResponse.json(
      { items, pageSize: params.pageSize, hasMore: Boolean(result.hasMore), nextCursor, total: null, totalNaoCadastrados: null },
      { headers: { 'Cache-Control': 'private, no-store', 'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, app;dur=${(performance.now() - startedAt).toFixed(1)}` } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Parâmetros inválidos.' }, { status: 400 });
  }
}
