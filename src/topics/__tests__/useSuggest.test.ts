// The catalog suggestions (src/topics/useSuggest.ts), over the real API client and a fake network.
// Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useSuggest } from '../useSuggest';

const C = {
  key: 'wikidata:Q15777',
  label: 'C (programming language)',
  group: 'code',
  kind: 'programming language',
  rank: 900,
  built_slug: null,
};
const ROUTE = 'GET /topics/suggest';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

function renderSuggest(initial: string) {
  const { client, wrapper } = queryWrapper();
  const hook = renderHook(({ query }: { query: string }) => useSuggest(query), {
    initialProps: { query: initial },
    wrapper,
  });
  return { ...hook, client };
}

describe('useSuggest', () => {
  it('is idle with no request for an empty or blank query', async () => {
    const requests = serveApi({ [ROUTE]: [json(200, { suggestions: [C] })] });
    const { result } = renderSuggest('  ');
    await advance(1000);

    expect(result.current).toStrictEqual({ status: 'idle', suggestions: [] });
    expect(requests).toHaveLength(0);
  });

  it('asks once, 200 ms after the last change: `c` then `c+` sends only `c+`', async () => {
    const requests = serveApi({ [ROUTE]: [json(200, { suggestions: [C] })] });
    const { result, rerender } = renderSuggest('');
    rerender({ query: 'c' });
    await advance(150);
    rerender({ query: 'c+' });
    await advance(199);

    expect(result.current.status).toBe('loading');
    expect(requests).toHaveLength(0);
    await advance(1);

    expect(requests.map((r) => `${r.path}${r.query}`)).toStrictEqual(['/topics/suggest?q=c%2B']);
    await advance(0);
    expect(result.current).toStrictEqual({ status: 'ready', suggestions: [C] });
  });

  it('cancels the request for the previous query when the query changes', async () => {
    const never = new Promise<Response>(() => undefined);
    const requests = serveApi({ [ROUTE]: [never, json(200, { suggestions: [C] })] });
    const { result, rerender, client } = renderSuggest('c');
    await advance(200);
    expect(client.getQueryState(['topics', 'suggest', 'c'])?.fetchStatus).toBe('fetching');

    rerender({ query: 'c+' });
    await advance(200);

    expect(requests.map((r) => r.query)).toStrictEqual(['?q=c', '?q=c%2B']);
    expect(client.getQueryState(['topics', 'suggest', 'c'])?.fetchStatus).toBe('idle');
    expect(result.current).toStrictEqual({ status: 'ready', suggestions: [C] });
  });

  it('gives no suggestions when the request fails', async () => {
    serveApi({ [ROUTE]: [json(500, { detail: 'boom' })] });
    const { result } = renderSuggest('c');
    await advance(200);

    expect(result.current).toStrictEqual({ status: 'error', suggestions: [] });
  });
});
