// The Explore results (src/topics/useExploreResults.ts): the preloaded slice matched as the
// learner types, merged with the server's suggestions. Over the real API client and a fake
// network; nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import {
  SUGGEST_DEBOUNCE_MS,
  TOP_STALE_MS,
  useExploreResults,
  type ExploreRow,
} from '../useExploreResults';

const TOP = 'GET /topics/suggest/top';
const SUGGEST = 'GET /topics/suggest';
const MINUTE = 60_000;

const row = (key: string, label: string, rank: number, group = 'prose') => ({
  key,
  label,
  group,
  kind: 'subject',
  rank,
  built_slug: null,
});
const C = row('wikidata:Q15777', 'C', 900, 'code');
const CPP = row('wikidata:Q2407', 'C++', 800, 'code');
const CHEMISTRY = row('wikidata:Q2329', 'Chemistry', 700);
const DANCE = row('wikidata:Q11639', 'Dance', 600);
const STOCKS = row('wikidata:Q177', 'Stock market', 500, 'quantitative');
const CLOJURE = row('wikidata:Q51798', 'Clojure', 100, 'code');

const topic = (slug: string, title: string) => ({
  slug,
  title,
  status: 'ready',
  description: null,
  level: 1,
  parent_slug: null,
  levels: [],
});
const COOKING = topic('cooking', 'Cooking');
const STRUDEL = topic('strudel', 'Strudel');

const slice = (topics: object[], rows: object[]) => json(200, { topics, rows });
const suggested = (...list: object[]) => json(200, { suggestions: list });
const never = new Promise<Response>(() => undefined);

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

function renderResults(routes: Record<string, Answer[]>, initial: string) {
  const requests = serveApi(routes);
  const { client, wrapper } = queryWrapper();
  const hook = renderHook(({ text }: { text: string }) => useExploreResults(text), {
    initialProps: { text: initial },
    wrapper,
  });
  return { ...hook, client, wrapper, requests };
}

const labels = (rows: ExploreRow[]) => rows.map((r) => r.label);

describe('useExploreResults: the slice, matched as the learner types', () => {
  it('is idle for a blank text, asks no suggestions, and still preloads the slice', async () => {
    const { result, requests } = renderResults(
      { [TOP]: [slice([COOKING], [C])], [SUGGEST]: [suggested(C)] },
      '  ',
    );
    await advance(1000);

    expect(result.current).toStrictEqual({ status: 'idle', rows: [] });
    expect(requests.map((r) => r.path)).toStrictEqual(['/topics/suggest/top']);
  });

  it('shows C, C++ and Chemistry for "c" before any suggestion lands; Dance is absent', async () => {
    const hook = renderResults(
      { [TOP]: [slice([], [C, CPP, CHEMISTRY, DANCE])], [SUGGEST]: [never] },
      '',
    );
    await advance(0);
    hook.rerender({ text: 'c' });

    expect(labels(hook.result.current.rows)).toStrictEqual(['C', 'C++', 'Chemistry']);
    expect(hook.result.current.status).toBe('loading');
    expect(hook.result.current.rows[0]).toStrictEqual({
      key: 'wikidata:Q15777',
      label: 'C',
      group: 'code',
      kind: 'subject',
      builtSlug: null,
      source: 'catalog',
    });
  });

  it.each([
    { text: 'mar', want: ['Stock market'] },
    { text: 'MAR', want: ['Stock market'] },
    { text: 'stock m', want: ['Stock market'] },
    { text: 'arket', want: [] },
    { text: 'an', want: [] },
  ])('matches "$text" by label prefix or word prefix only', async ({ text, want }) => {
    const hook = renderResults({ [TOP]: [slice([], [STOCKS, DANCE])], [SUGGEST]: [never] }, '');
    await advance(0);
    hook.rerender({ text });

    expect(labels(hook.result.current.rows)).toStrictEqual(want);
  });
});

describe('useExploreResults: the server’s rows', () => {
  it('merges the suggestions by key: open topics, the server’s rows in order, then the slice', async () => {
    const hook = renderResults(
      {
        [TOP]: [slice([COOKING, STRUDEL], [C, CPP, CHEMISTRY, DANCE])],
        [SUGGEST]: [suggested(CPP, CLOJURE)],
      },
      '',
    );
    await advance(0);
    hook.rerender({ text: 'c' });
    await advance(SUGGEST_DEBOUNCE_MS - 1);
    expect(hook.requests.filter((r) => r.path === '/topics/suggest')).toHaveLength(0);
    await advance(1);

    expect(hook.requests.map((r) => `${r.path}${r.query}`)).toStrictEqual([
      '/topics/suggest/top',
      '/topics/suggest?q=c',
    ]);
    expect(hook.result.current.status).toBe('ready');
    expect(labels(hook.result.current.rows)).toStrictEqual([
      'Cooking',
      'C++',
      'Clojure',
      'C',
      'Chemistry',
    ]);
  });

  it('puts a matching open topic first, as a topic row', async () => {
    const hook = renderResults(
      { [TOP]: [slice([COOKING, STRUDEL], [STOCKS])], [SUGGEST]: [suggested(STOCKS)] },
      '',
    );
    await advance(0);
    hook.rerender({ text: 'str' });
    await advance(SUGGEST_DEBOUNCE_MS);

    expect(hook.result.current.rows[0]).toStrictEqual({
      key: 'topic:strudel',
      label: 'Strudel',
      group: 'prose',
      kind: null,
      builtSlug: 'strudel',
      source: 'topic',
    });
    expect(labels(hook.result.current.rows)).toStrictEqual(['Strudel', 'Stock market']);
  });

  it.each([
    { why: 'fails', answer: json(500, { detail: 'boom' }) },
    { why: 'never answers', answer: never },
  ])('gives the server’s rows alone when the slice $why', async ({ answer }) => {
    const hook = renderResults({ [TOP]: [answer], [SUGGEST]: [suggested(CPP, CLOJURE)] }, '');
    await advance(0);
    hook.rerender({ text: 'c' });
    expect(hook.result.current).toStrictEqual({ status: 'loading', rows: [] });
    await advance(SUGGEST_DEBOUNCE_MS);

    expect(hook.result.current.status).toBe('ready');
    expect(labels(hook.result.current.rows)).toStrictEqual(['C++', 'Clojure']);
  });

  it('is an error with the slice’s matches when the suggestions fail', async () => {
    const hook = renderResults(
      { [TOP]: [slice([], [C, DANCE])], [SUGGEST]: [json(500, { detail: 'boom' })] },
      '',
    );
    await advance(0);
    hook.rerender({ text: 'c' });
    await advance(SUGGEST_DEBOUNCE_MS);

    expect(hook.result.current.status).toBe('error');
    expect(labels(hook.result.current.rows)).toStrictEqual(['C']);
  });
});

describe('useExploreResults: the cached slice', () => {
  it('asks for the slice once across two mounts within an hour', async () => {
    const first = renderResults({ [TOP]: [slice([], [C])] }, '');
    await advance(0);
    first.unmount();
    await advance(TOP_STALE_MS - MINUTE);
    const second = renderHook(() => useExploreResults(''), { wrapper: first.wrapper });
    await advance(0);
    second.unmount();

    expect(first.requests.map((r) => r.path)).toStrictEqual(['/topics/suggest/top']);
  });

  it('asks for the slice again on a mount after an hour', async () => {
    const first = renderResults({ [TOP]: [slice([], [C])] }, '');
    await advance(0);
    first.unmount();
    await advance(TOP_STALE_MS + MINUTE);
    const second = renderHook(() => useExploreResults(''), { wrapper: first.wrapper });
    await advance(0);
    second.unmount();

    expect(first.requests).toHaveLength(2);
  });

  it('does not mistake the text "top" for the slice', async () => {
    const hook = renderResults(
      { [TOP]: [slice([], [])], [SUGGEST]: [suggested(row('wikidata:Q1', 'Topology', 5))] },
      '',
    );
    await advance(0);
    hook.rerender({ text: 'top' });
    await advance(SUGGEST_DEBOUNCE_MS);

    expect(hook.result.current).toMatchObject({ status: 'ready', rows: [{ label: 'Topology' }] });
  });
});
