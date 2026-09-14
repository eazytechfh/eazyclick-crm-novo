import { describe, expect, it } from 'vitest';
import { ListRequestEpoch } from './list-request-epoch';

describe('ListRequestEpoch', () => {
  it('invalida respostas de buscas anteriores quando uma nova substituição começa', () => {
    const epoch = new ListRequestEpoch();
    const oldRequest = epoch.begin(true);
    const currentRequest = epoch.begin(true);

    expect(epoch.isCurrent(oldRequest)).toBe(false);
    expect(epoch.isCurrent(currentRequest)).toBe(true);
  });

  it('mantém a paginação na mesma versão da busca atual', () => {
    const epoch = new ListRequestEpoch();
    const currentRequest = epoch.begin(true);
    const appendRequest = epoch.begin(false);

    expect(appendRequest).toBe(currentRequest);
    expect(epoch.isCurrent(appendRequest)).toBe(true);
  });
});
