// The set the API source last served (src/data/apiSource.ts, `getCurrentSet`), which a card added
// to the running set names (`POST /feed/extra`). The API client is the real one over a fake
// network; the answers are the saved `GET /feed/today` response.
import response from '../__fixtures__/feed_response.json';
import { createApiSource } from '../apiSource';
import { json, network } from '../testing/network';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const ok = (setNumber: number, feedDate: string) =>
  json(200, { ...response, set_number: setNumber, feed_date: feedDate });

describe('createApiSource: getCurrentSet', () => {
  it('is null before the first set, then the served set, by its date and number', async () => {
    const { api } = network(ok(1, '2026-10-05'), ok(2, '2026-10-05'));
    const source = createApiSource(api, () => 'strudel');
    expect(source.getCurrentSet()).toBeNull();

    await source.getNextSet();
    expect(source.getCurrentSet()).toStrictEqual({ feedDate: '2026-10-05', setNumber: 1 });
    await source.getNextSet();
    expect(source.getCurrentSet()).toStrictEqual({ feedDate: '2026-10-05', setNumber: 2 });
  });
});
