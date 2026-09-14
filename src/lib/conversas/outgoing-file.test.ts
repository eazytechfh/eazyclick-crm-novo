import { describe, expect, it } from 'vitest';
import { validateOutgoingFile } from './outgoing-file';

describe('validateOutgoingFile', () => {
  it('aceita PDF real e limpa o nome', async () => {
    const file = new File([new TextEncoder().encode('%PDF-1.7')], '../proposta.pdf', { type: 'application/pdf' });
    await expect(validateOutgoingFile(file)).resolves.toMatchObject({ tipo: 'document', fileName: 'proposta.pdf' });
  });

  it('aceita imagem PNG pela assinatura binária', async () => {
    const file = new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])], 'foto.png', { type: 'image/png' });
    await expect(validateOutgoingFile(file)).resolves.toMatchObject({ tipo: 'image' });
  });

  it('recusa arquivo executável disfarçado de PDF', async () => {
    const file = new File([new TextEncoder().encode('MZ fake')], 'boleto.pdf', { type: 'application/pdf' });
    await expect(validateOutgoingFile(file)).resolves.toBeNull();
  });
});
