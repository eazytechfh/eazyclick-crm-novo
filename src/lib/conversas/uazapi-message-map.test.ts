import { describe, expect, it } from 'vitest';
import { mapUazapiMessage } from './uazapi-message-map';

describe('mapUazapiMessage API origin', () => {
  it('identifica mensagens enviadas pela API para não reimportar a assinatura no CRM', () => {
    const mapped = mapUazapiMessage({
      messageid: 'provider-1',
      fromMe: true,
      wasSentByApi: true,
      text: '*Ana*\nOlá',
    }) as ReturnType<typeof mapUazapiMessage> & { wasSentByApi?: boolean };

    expect(mapped.wasSentByApi).toBe(true);
  });
});
