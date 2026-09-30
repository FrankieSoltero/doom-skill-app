// The recorded summary of a set (src/data/apiSource.ts, `fetchSummary`): `GET /feed/summary` for
// the set's topic, number and date, through the real API client over a fake network. The answer
// is the saved feed response's summary, which has the same shape.
import { logWarning } from '../../log';
import response from '../__fixtures__/feed_response.json';
import { fetchSummary } from '../apiSource';
import { FeedLoadError } from '../source';
import { json, network } from '../testing/network';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const ASKED = { topic: 'strudel', setNumber: 3, feedDate: '2026-10-01' };

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('fetchSummary', () => {
  it('asks for the set by topic, number and date, and reads the answer in the app shape', async () => {
    const { api, requests } = network(json(200, response.summary));

    const summary = await fetchSummary(api, ASKED);

    expect(requests).toStrictEqual(['/feed/summary?topic=strudel&set=3&date=2026-10-01']);
    expect(summary).toStrictEqual({
      title: response.summary.title,
      progressDelta: response.summary.progress_delta,
      moved: response.summary.moved,
      tomorrow: response.summary.tomorrow,
      reminder: response.summary.reminder,
    });
  });

  it('fails with the kind of the API error', async () => {
    const { api } = network(json(404, { detail: 'Not found' }));

    await expect(fetchSummary(api, ASKED)).rejects.toMatchObject({
      name: 'FeedLoadError',
      kind: 'notFound',
    });
  });

  it('fails with kind schema for a summary the schema refuses, logging the paths only', async () => {
    const bad = { ...response.summary, title: 42, tomorrow: 'secret-marker', moved: 'x' };
    const { api } = network(json(200, bad));

    const error: unknown = await fetchSummary(api, ASKED).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(FeedLoadError);
    expect(error).toMatchObject({
      kind: 'schema',
      message: 'Summary failed validation at title; moved',
    });
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['summary_invalid', { paths: 'title; moved' }],
    ]);
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});
