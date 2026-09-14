import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessConversation } from './access';

function asAccessClient(client: object): Pick<SupabaseClient, 'rpc'> {
  return client as unknown as Pick<SupabaseClient, 'rpc'>;
}

function accessClient(allowed: boolean, error: Error | null = null) {
  return {
    rpc: async () => ({ data: allowed, error }),
  };
}

describe('canAccessConversation', () => {
  it('nega quando nenhuma conversa ou lead está visível pelas policies', async () => {
    await expect(canAccessConversation(asAccessClient(accessClient(false)), '1199999999')).resolves.toBe(false);
  });

  it('permite uma conversa já visível pelas policies', async () => {
    await expect(canAccessConversation(asAccessClient(accessClient(true)), '1199999999')).resolves.toBe(true);
  });

  it('permite iniciar conversa com um lead atribuído antes da primeira mensagem', async () => {
    await expect(canAccessConversation(asAccessClient(accessClient(true)), '1199999999')).resolves.toBe(true);
  });

  it('nega de forma segura quando a consulta falha', async () => {
    await expect(canAccessConversation(asAccessClient(accessClient(false, new Error('falha'))), '1199999999')).resolves.toBe(false);
  });
});
