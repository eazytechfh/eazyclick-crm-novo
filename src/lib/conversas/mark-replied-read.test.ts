import { describe, expect, it, vi } from 'vitest';
import { markConversationReadAfterReply } from './mark-replied-read';

describe('markConversationReadAfterReply', () => {
  it('salva como lido o total atual e a mensagem mais recente após responder', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { total_mensagens: 7, ultima_mensagem_id: 44 },
      error: null,
    });
    const eqTelefone = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqTelefone });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ select });

    const result = await markConversationReadAfterReply(
      { from, rpc } as never,
      '1199999999',
      'user-1',
      42,
      '2026-08-20T15:00:00.000Z'
    );

    expect(result).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'marcar_conversa_lida',
      {
        p_telefone_normalizado: '1199999999',
        p_user_id: 'user-1',
        p_ultima_mensagem_lida_id: 44,
        p_total_mensagens: 7,
        p_atualizado_em: '2026-08-20T15:00:00.000Z',
      }
    );
  });

  it('usa a mensagem respondida quando o resumo ainda não expõe a última mensagem', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { total_mensagens: 1, ultima_mensagem_id: null }, error: null });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ select });

    await markConversationReadAfterReply({ from, rpc } as never, '1199999999', 'user-1', 42);

    expect(rpc).toHaveBeenCalledWith('marcar_conversa_lida', expect.objectContaining({ p_ultima_mensagem_lida_id: 42 }));
  });

  it('não grava leitura quando não consegue obter o resumo', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha' } });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const rpc = vi.fn();
    const from = vi.fn().mockReturnValue({ select });

    await expect(markConversationReadAfterReply({ from, rpc } as never, '1199999999', 'user-1', 42)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('não transforma um envio já concluído em falha quando a leitura lança erro de rede', async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockRejectedValue(new Error('rede indisponível')),
      }),
    });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn();

    await expect(markConversationReadAfterReply({ from, rpc } as never, '1199999999', 'user-1', 42)).resolves.toBe(false);
  });

  it('retorna falso quando a atualização atômica é rejeitada pelo banco', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { total_mensagens: 7, ultima_mensagem_id: 44 }, error: null });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) });
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'falha' } });

    await expect(markConversationReadAfterReply({ from, rpc } as never, '1199999999', 'user-1', 42)).resolves.toBe(false);
  });
});
