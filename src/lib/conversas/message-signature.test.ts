import { describe, expect, it } from 'vitest';
import { buildWhatsAppText, extractWhatsAppSignatureName, hashWhatsAppText, stripWhatsAppSignature } from './message-signature';

describe('buildWhatsAppText', () => {
  it('inclui o nome em negrito antes da mensagem quando ativada', () => {
    expect(buildWhatsAppText('Olá, tudo bem?', 'Ana Souza', true)).toBe('*Ana Souza*\nOlá, tudo bem?');
  });

  it('mantém somente a mensagem quando desativada', () => {
    expect(buildWhatsAppText('Olá', 'Ana Souza', false)).toBe('Olá');
  });

  it('mantém somente a mensagem quando não há nome', () => {
    expect(buildWhatsAppText('Olá', null, true)).toBe('Olá');
  });

  it('remove caracteres que poderiam quebrar o negrito do WhatsApp', () => {
    expect(buildWhatsAppText('Olá', '  Ana *\n Souza  ', true)).toBe('*Ana Souza*\nOlá');
  });

  it('gera hash estável do conteúdo efetivamente enviado ao provedor', () => {
    expect(hashWhatsAppText('*Ana*\nOlá')).toBe(hashWhatsAppText('*Ana*\nOlá'));
    expect(hashWhatsAppText('*Ana*\nOlá')).not.toBe(hashWhatsAppText('Olá'));
  });

  it('remove somente a primeira linha de assinatura do conteúdo importado', () => {
    expect(stripWhatsAppSignature('*Ana Souza*\nOlá\nTudo bem?')).toBe('Olá\nTudo bem?');
    expect(stripWhatsAppSignature('*texto em negrito* sem quebra')).toBe('*texto em negrito* sem quebra');
  });

  it('extrai o nome apenas quando existe uma primeira linha completa em negrito', () => {
    expect(extractWhatsAppSignatureName('*Ana Souza*\nOlá')).toBe('Ana Souza');
    expect(extractWhatsAppSignatureName('*Promoção* sem quebra')).toBeNull();
  });
});
