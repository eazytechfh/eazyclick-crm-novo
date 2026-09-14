import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  markConversationMessageSent,
  queueConversationMessageReconciliation,
  reconcileQueuedConversationMessage,
} from './delivery-state';

function deliveryClient(errors: Array<Error | null>) {
  let attempts = 0;
  const client = {
    from() {
      return {
        update() {
          return {
            async eq() {
              const error = errors[Math.min(attempts, errors.length - 1)] ?? null;
              attempts += 1;
              return { error };
            },
          };
        },
      };
    },
  } as unknown as Pick<SupabaseClient, 'from'>;
  return { client, attempts: () => attempts };
}

describe('markConversationMessageSent', () => {
  it('persiste o estado enviado na primeira tentativa', async () => {
    const { client, attempts } = deliveryClient([null]);
    await expect(markConversationMessageSent(client, 1, 'provider-1')).resolves.toBe(true);
    expect(attempts()).toBe(1);
  });

  it('tenta novamente uma vez quando a persistência falha', async () => {
    const { client, attempts } = deliveryClient([new Error('transitório'), null]);
    await expect(markConversationMessageSent(client, 1, 'provider-1')).resolves.toBe(true);
    expect(attempts()).toBe(2);
  });

  it('informa a falha depois das duas tentativas', async () => {
    const { client, attempts } = deliveryClient([new Error('falha'), new Error('falha')]);
    await expect(markConversationMessageSent(client, 1, 'provider-1')).resolves.toBe(false);
    expect(attempts()).toBe(2);
  });

  it('enfileira de forma durável um provider ID que ainda não pôde ser anexado', async () => {
    const client = {
      from: () => ({ upsert: async () => ({ error: null }) }),
    } as unknown as Pick<SupabaseClient, 'from'>;

    await expect(queueConversationMessageReconciliation(client, 1, 'provider-1')).resolves.toBe(true);
  });

  it('reconcilia e remove uma pendência encontrada durante a importação', async () => {
    let removed = false;
    const client = {
      from(table: string) {
        if (table === 'conversas_mensagens') {
          return { update: () => ({ eq: async () => ({ error: null }) }) };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { message_id: 7 }, error: null }) }) }),
          delete: () => ({ eq: async () => { removed = true; return { error: null }; } }),
        };
      },
    } as unknown as Pick<SupabaseClient, 'from'>;

    await expect(reconcileQueuedConversationMessage(client, 'provider-1')).resolves.toBe(true);
    expect(removed).toBe(true);
  });
});
