import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { findLocalAudioMessageForProvider, findLocalMessageForProviderText } from './delivery-reconciliation';

function reconciliationClient(messageIds: number[], error: Error | null = null) {
  const terminal = Promise.resolve({ data: messageIds.map((id) => ({ id })), error });
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => terminal,
  };
  return { from: () => chain } as unknown as Pick<SupabaseClient, 'from'>;
}

describe('findLocalMessageForProviderText', () => {
  it('encontra a linha local pendente pelo hash da versão assinada', async () => {
    await expect(findLocalMessageForProviderText(reconciliationClient([42]), '1199999999', '*Ana*\nOlá', Date.now())).resolves.toBe(42);
  });

  it('não associa mensagem histórica sem linha local correspondente', async () => {
    await expect(findLocalMessageForProviderText(reconciliationClient([]), '1199999999', '*Ana*\nOlá', Date.now())).resolves.toBeNull();
  });

  it('não escolhe arbitrariamente quando há mais de uma tentativa idêntica', async () => {
    await expect(findLocalMessageForProviderText(reconciliationClient([41, 42]), '1199999999', '*Ana*\nOlá', Date.now())).resolves.toBeNull();
  });

  it('falha fechada quando a consulta dá erro', async () => {
    await expect(findLocalMessageForProviderText(reconciliationClient([], new Error('falha')), '1199999999', '*Ana*\nOlá', Date.now())).resolves.toBeNull();
  });

  it('encontra um único áudio local pendente na janela do provedor', async () => {
    await expect(findLocalAudioMessageForProvider(reconciliationClient([51]), '1199999999', Date.now())).resolves.toBe(51);
  });
});
