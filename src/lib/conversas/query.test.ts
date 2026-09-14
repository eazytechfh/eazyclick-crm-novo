import { describe, expect, it } from 'vitest';
import { parseListParams, parseMessageParams } from './query';

describe('query cursors', () => {
  it('limita páginas e aceita cursor opaco', () => {
    const parsed = parseListParams(new URLSearchParams('pageSize=999&cursor=abc'));
    expect(parsed.pageSize).toBe(60);
    expect(parsed.cursor).toBe('abc');
  });

  it('limita busca para proteger a consulta', () => {
    expect(() => parseListParams(new URLSearchParams(`q=${'a'.repeat(121)}`))).toThrow('Busca muito longa.');
  });

  it('rejeita dois cursores de mensagem', () => {
    expect(() => parseMessageParams(new URLSearchParams('beforeId=1&afterId=2'))).toThrow('Use apenas um cursor.');
  });
});
