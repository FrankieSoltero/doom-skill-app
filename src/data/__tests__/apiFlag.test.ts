// A learner's flag on a card (src/data/apiSource.ts, `sendFlag`): `POST /cards/{id}/flag` with
// the reason, through the real API client over a fake network. Sent once, never retried.
import { sendFlag } from '../apiSource';
import { json, network } from '../testing/network';

const CARD_ID = '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f';

describe('sendFlag', () => {
  it('posts the reason to the card and resolves on a 204', async () => {
    const { api, requests, sent } = network(new Response(null, { status: 204 }));

    await expect(sendFlag(api, CARD_ID, 'unclear')).resolves.toBeUndefined();

    expect(requests).toStrictEqual([`/cards/${CARD_ID}/flag`]);
    expect(sent[0]?.method).toBe('POST');
    expect(JSON.parse((await sent[0]?.text()) ?? '')).toStrictEqual({ reason: 'unclear' });
  });

  it.each([
    [json(503, { detail: 'Service unavailable' }), 'unavailable'],
    [json(429, { detail: 'Too many requests' }), 'rateLimited'],
    [new TypeError('offline'), 'offline'],
  ])('rejects with the kind of the failure, after one request: %#', async (answer, kind) => {
    const { api, requests } = network(answer);

    await expect(sendFlag(api, CARD_ID, 'wrong')).rejects.toMatchObject({ kind });

    expect(requests).toHaveLength(1);
  });
});
