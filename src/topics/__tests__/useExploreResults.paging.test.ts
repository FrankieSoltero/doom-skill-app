// The Explore results' pages for a typed text (src/topics/useExploreResults.ts; curriculum
// catalog plan, C7): `loadingMore` holds whenever a tap on Show more would do nothing (the next
// page on its way, or the list's own answer refetching), and the next page's offset counts the
// server's rows only, whatever the slice and the open topics add to page 0. Over the real API
// client and a fake network; the screen's paging is in app/(tabs)/__tests__/explore.paging.test.tsx.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { advance } from '../../components/testing/screen';
import { SUGGEST_DEBOUNCE_MS, useExploreResults } from '../useExploreResults';

const TOP = 'GET /topics/suggest/top';
const SUGGEST = 'GET /topics/suggest';

/** `count` catalog subjects from number `from`, keyed `ocw:subject/n-<n>`, labelled "Neuron <n>". */
const neurons = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const n = String(from + i);
    return {
      key: `ocw:subject/n-${n}`,
      label: `Neuron ${n}`,
      group: 'prose',
      kind: 'subject',
      rank: 100 - from - i,
      built_slug: null,
      branches: 0,
      tier: 1,
      depth: 3,
      parent: 'Brain and Cognitive Sciences',
    };
  });
const page = (rows: object[], hasMore: boolean) =>
  json(200, { suggestions: rows, has_more: hasMore });
const NEUROSCIENCE = {
  slug: 'neuroscience',
  title: 'Neuroscience',
  status: 'ready',
  description: null,
  level: 1,
  parent_slug: null,
  levels: [],
};
const never = new Promise<Response>(() => undefined);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function renderNeurons(routes: Record<string, Answer[]>) {
  const requests = serveApi(routes);
  const { client, wrapper } = queryWrapper();
  const hook = renderHook(() => useExploreResults('neur'), { wrapper });
  const asked = () => requests.filter((r) => r.path === '/topics/suggest').map((r) => r.query);
  return { ...hook, client, asked };
}

describe('useExploreResults: Show more while the list refetches', () => {
  it('is loading more while its own answer refetches, and a tap then asks nothing', async () => {
    const { result, client, asked } = renderNeurons({
      [TOP]: [json(200, { topics: [], rows: [], has_more: false })],
      [SUGGEST]: [page(neurons(0, 20), true), never],
    });
    await advance(SUGGEST_DEBOUNCE_MS + 100);
    expect(result.current).toMatchObject({ status: 'ready', hasMore: true, loadingMore: false });

    act(() => {
      void client.invalidateQueries({ queryKey: ['topics', 'suggest'] });
    });
    await advance(0);
    act(() => {
      result.current.loadMore();
    });
    await advance(0);

    expect(result.current).toMatchObject({ hasMore: true, loadingMore: true });
    expect(asked()).toStrictEqual(['?q=neur', '?q=neur']);
  });
});

describe('useExploreResults: the next page for a typed text', () => {
  it('asks offset=20 after an open topic and repeating slice rows; no key twice', async () => {
    // The slice repeats two of the server's rows and adds one of its own (Neuron 90).
    const preload = { topics: [NEUROSCIENCE], rows: neurons(3, 2).concat(neurons(90, 1)) };
    const { result, asked } = renderNeurons({
      [TOP]: [json(200, { ...preload, has_more: false })],
      [SUGGEST]: [page(neurons(0, 20), true), page(neurons(20, 5), false)],
    });
    await advance(SUGGEST_DEBOUNCE_MS + 100);
    expect(result.current.rows[0]?.label).toBe('Neuroscience');

    act(() => {
      result.current.loadMore();
    });
    await advance(0);

    expect(asked()).toStrictEqual(['?q=neur', '?q=neur&offset=20']);
    const keys = result.current.rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('ocw:subject/n-24');
    expect(result.current.hasMore).toBe(false);
  });
});
