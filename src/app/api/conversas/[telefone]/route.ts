import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseMessageParams } from '@/lib/conversas/query';
import type { BaseDeLeads, ConversaMensagem } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { telefone: string } }) {
  const startedAt = performance.now();
  if (!/^\d{8,13}$/.test(params.telefone)) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 });
  const supabase = createClient();

  try {
    const query = parseMessageParams(new URL(request.url).searchParams);
    if (query.afterId !== null) return NextResponse.json({ error: 'Cursor não suportado nesta rota.' }, { status: 400 });
    const dbStartedAt = performance.now();
    const { data, error } = await supabase.rpc('carregar_conversa_cursor', {
      p_telefone: params.telefone,
      p_limite: query.limit,
      p_antes_id: query.beforeId,
    });
    const dbDuration = performance.now() - dbStartedAt;
    if (error) {
      const badCursor = error.code === '22023';
      return NextResponse.json(
        { error: badCursor ? 'Cursor inválido.' : 'Conversa não encontrada.' },
        { status: badCursor ? 400 : 404, headers: { 'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, app;dur=${(performance.now() - startedAt).toFixed(1)}` } }
      );
    }
    const result = (data ?? {}) as { messages?: ConversaMensagem[]; hasMore?: boolean; totalMessages?: number; lead?: BaseDeLeads | null };
    const messages = result.messages ?? [];
    return NextResponse.json(
      {
        messages,
        hasMore: Boolean(result.hasMore),
        oldestMessageId: messages[0]?.id ?? null,
        newestMessageId: messages.at(-1)?.id ?? null,
        totalMessages: result.totalMessages ?? null,
        lead: result.lead ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store', 'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, app;dur=${(performance.now() - startedAt).toFixed(1)}` } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Parâmetros inválidos.' }, { status: 400 });
  }
}
