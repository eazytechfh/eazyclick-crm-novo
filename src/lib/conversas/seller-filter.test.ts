import { describe, expect, it } from 'vitest';
import { SellerFilterForbiddenError, resolveSellerFilter } from './seller-filter';

describe('resolveSellerFilter', () => {
  it.each(['admin_master', 'admin', 'gerente'] as const)('permite filtro para %s', (cargo) => {
    expect(resolveSellerFilter(cargo, '  Renan  ')).toBe('Renan');
  });

  it('recusa filtro enviado por vendedor', () => {
    expect(() => resolveSellerFilter('vendedor', 'Renan')).toThrow(SellerFilterForbiddenError);
  });

  it('não exige filtro', () => expect(resolveSellerFilter('vendedor', null)).toBeNull());
});
