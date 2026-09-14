import type { Cargo } from '@/types/database';

export class SellerFilterForbiddenError extends Error {}

export function resolveSellerFilter(cargo: Cargo, requested: string | null): string | null {
  const seller = requested?.trim() || null;
  if (!seller) return null;
  if (!['admin_master', 'admin', 'gerente'].includes(cargo)) throw new SellerFilterForbiddenError();
  return seller.slice(0, 120);
}
