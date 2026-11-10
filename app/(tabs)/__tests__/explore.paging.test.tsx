// The Explore list's pages (app/(tabs)/explore.tsx over src/topics/useExploreResults.ts;
// curriculum catalog plan, C7): a page whose answer says `has_more` shows Show more under the
// last row; its tap asks for the next page at the offset of the catalog rows loaded so far (never
// counting the open topics) and appends it. The preloaded list, shown before anything is typed,
// pages the same way, and a new text starts again at its first page. Over the real API client and
// a fake network; the rest of the list is in explore.suggest.test.tsx.
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import { useExploreResults } from '../../../src/topics/useExploreResults';
import ExploreScreen from '../explore';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
  router: { push: jest.fn() },
}));

const TOP = 'GET /topics/suggest/top';
const SUGGEST = 'GET /topics/suggest';
const IDLE = 'Search for a topic to learn.';

/** `count` catalog subjects from number `from`, labelled "Cell 0", "Cell 1", … */
const cells = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: `ocw:cell-${String(from + i)}`,
    label: `Cell ${String(from + i)}`,
    group: 'prose',
    kind: 'subject',
    rank: 0,
    built_slug: null,
    branches: 0,
    tier: 1,
    depth: 3,
    parent: 'Biology',
  }));
const open = (slug: string, title: string) => ({
  slug,
  title,
  status: 'ready',
  description: null,
  level: 1,
  parent_slug: null,
  levels: [],
});
const suggested = (rows: object[], has_more: boolean) => json(200, { suggestions: rows, has_more });
const preload = (topics: object[], rows: object[], has_more: boolean) =>
  json(200, { topics, rows, has_more });
const NO_PRELOAD = preload([], [], false);
const never = new Promise<Response>(() => undefined);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderExplore(routes: Record<string, Answer[]>) {
  const requests = serveApi({ 'GET /me/enrollments': [json(200, { enrollments: [] })], ...routes });
  await renderScreen(<ExploreScreen />);
  return requests;
}

async function search(text: string) {
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
}

async function pressShowMore() {
  fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
  await advance(0);
}

/** The rows on the screen, as a screen reader hears them. */
const shown = () =>
  screen.queryAllByTestId('explore-row').map((row) => row.props.accessibilityLabel as string);
const showMore = () => screen.queryByRole('button', { name: 'Show more' });
/** The query strings of the requests sent to `path`. */
const asked = (requests: { path: string; query: string }[], path: string) =>
  requests.filter((r) => r.path === path).map((r) => r.query);

describe('Explore: Show more', () => {
  it('shows it under a full page with more; its tap asks offset=20 and appends the page', async () => {
    const requests = await renderExplore({
      [TOP]: [NO_PRELOAD],
      [SUGGEST]: [suggested(cells(0, 20), true), suggested(cells(20, 5), false)],
    });
    await search('cell');
    expect(shown()).toHaveLength(20);
    expect(showMore()).toBeOnTheScreen();

    await pressShowMore();

    expect(asked(requests, '/topics/suggest')).toStrictEqual(['?q=cell', '?q=cell&offset=20']);
    expect(shown()).toHaveLength(25);
    expect(shown()[0]).toBe('Cell 0, prose, Build');
    expect(shown().at(-1)).toBe('Cell 24, prose, Build');
    expect(showMore()).toBeNull();
  });

  it('is not shown when the page is the last', async () => {
    await renderExplore({ [TOP]: [NO_PRELOAD], [SUGGEST]: [suggested(cells(0, 20), false)] });
    await search('cell');

    expect(shown()).toHaveLength(20);
    expect(showMore()).toBeNull();
  });

  it('is not shown while the next page loads; the rows stay', async () => {
    await renderExplore({ [TOP]: [NO_PRELOAD], [SUGGEST]: [suggested(cells(0, 20), true), never] });
    await search('cell');

    await pressShowMore();

    expect(showMore()).toBeNull();
    expect(shown()).toHaveLength(20);
  });
});

describe('Explore: the preloaded list', () => {
  it('pages the same way under the idle line; the offset counts no open topic', async () => {
    const requests = await renderExplore({
      [TOP]: [
        preload([open('strudel', 'Strudel')], cells(0, 20), true),
        preload([], cells(20, 5), false),
      ],
    });
    expect(screen.getByText(IDLE)).toBeOnTheScreen();
    expect(shown()).toHaveLength(21);
    expect(shown()[0]).toBe('Strudel, Open');

    await pressShowMore();

    expect(asked(requests, '/topics/suggest/top')).toStrictEqual(['', '?offset=20']);
    expect(shown()).toHaveLength(26);
    expect(shown().at(-1)).toBe('Cell 24, prose, Build');
    expect(showMore()).toBeNull();
    expect(asked(requests, '/topics/suggest')).toStrictEqual([]);
  });
});

describe('Explore: a new text', () => {
  it('starts at page 0: the last text’s pages are gone, and its next page is its own', async () => {
    const requests = await renderExplore({
      [TOP]: [NO_PRELOAD],
      [SUGGEST]: [
        suggested(cells(0, 20), true),
        suggested(cells(20, 5), true),
        suggested(cells(0, 20), true),
      ],
    });
    await search('cell');
    await pressShowMore();
    expect(shown()).toHaveLength(25);

    await search('cel');
    expect(shown()).toHaveLength(20);
    expect(shown()).not.toContain('Cell 20, prose, Build');
    await pressShowMore();
    expect(asked(requests, '/topics/suggest').slice(2)).toStrictEqual([
      '?q=cel',
      '?q=cel&offset=20',
    ]);

    await search('cell');
    expect(shown()).toHaveLength(20);
  });
});

describe('useExploreResults: loadMore', () => {
  it('ignores a call while a page is loading', async () => {
    const requests = serveApi({
      [TOP]: [NO_PRELOAD],
      [SUGGEST]: [suggested(cells(0, 20), true), never],
    });
    const { result } = renderHook(() => useExploreResults('cell'), {
      wrapper: queryWrapper().wrapper,
    });
    await advance(300);
    expect(result.current).toMatchObject({ hasMore: true, pages: [cells(0, 20).map(() => ({}))] });

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await advance(0);
    act(() => {
      result.current.loadMore();
    });
    await advance(0);

    expect(asked(requests, '/topics/suggest')).toStrictEqual(['?q=cell', '?q=cell&offset=20']);
  });

  it('carries each row’s tier, depth and parent', async () => {
    serveApi({ [TOP]: [NO_PRELOAD], [SUGGEST]: [suggested(cells(0, 1), false)] });
    const { result } = renderHook(() => useExploreResults('cell'), {
      wrapper: queryWrapper().wrapper,
    });
    await advance(300);

    expect(result.current.rows[0]).toMatchObject({ tier: 1, depth: 3, parent: 'Biology' });
    expect(result.current.hasMore).toBe(false);
  });
});
