// The Explore tab (app/(tabs)/explore.tsx), over the real API client and a fake network.
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { RefreshControl } from 'react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import {
  advance,
  pressRetry,
  renderScreen,
  SCREEN_TOP_INSET,
} from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { colors } from '../../../src/theme';
import {
  useFocusEffect as mockUseFocusEffect,
  setFocused,
} from '../../../src/topics/testing/focus';
import { ENROLLMENTS_KEY } from '../../../src/topics/useChoose';
import type { Enrollment } from '../../../src/topics/useEnrollments';
import ExploreScreen from '../explore';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const topic = (slug: string, title: string, status: string) => ({
  slug,
  title,
  status,
  description: null,
  level: 1,
  parent_slug: null,
  levels: [{ slug, level: 1, status, published: true }],
});
/** The root `strudel` with its levels 2 and 3, as `GET /topics` lists them. */
const level = (n: number, status: string, published: boolean) => ({
  slug: `strudel-level-${String(n)}`,
  level: n,
  status,
  published,
});
const STRUDEL = topic('strudel', 'Strudel', 'ready');
const BUILDING = topic('sql', 'SQL window functions', 'ingesting');
const RUST = topic('rust-ownership', 'Rust ownership', 'pending');
const PROPOSED = topic('c-templates', 'C++ templates', 'proposed');
const job = (status: string) =>
  json(200, { id: 'job-1', kind: 'k', progress: {}, reason: null, status });
const PLAN = { status: 'active', daily_minutes: 15, horizon_days: 14, progress: 0.25 } as const;
const enrollment = (topic_slug: string, level: number, last_studied_at: string): Enrollment => ({
  ...PLAN,
  topic_slug,
  topic_title: topic_slug,
  started_at: '2026-09-30T12:00:00Z',
  level,
  last_studied_at,
});
const OLDER = enrollment('strudel', 1, '2026-10-01T09:00:00Z');
const NEWER = enrollment('sql', 2, '2026-10-08T09:00:00Z');
const enrolled = (...list: Enrollment[]) => json(200, { enrollments: list });
const IDLE = 'Search for a topic to learn.';

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
  setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderExplore(routes: Parameters<typeof serveApi>[0]) {
  const requests = serveApi({ 'GET /me/enrollments': [enrolled()], ...routes });
  await renderScreen(<ExploreScreen />);
  return requests;
}

async function search(text: string) {
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
}

describe('Explore: idle and loading', () => {
  it('shows the title, the search field and a hint, on paper below the inset', async () => {
    await renderExplore({});

    expect(screen.getByRole('header', { name: 'Explore' })).toBeOnTheScreen();
    const field = screen.getByLabelText('Search topics');
    expect(field).toHaveProp('maxLength', 80);
    expect(field).toHaveProp('placeholder', 'Learn anything technical…');
    expect(screen.getByText(IDLE)).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('explore-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });

  it('shows a busy line while it waits for the search', async () => {
    await renderExplore({});
    fireEvent.changeText(screen.getByLabelText('Search topics'), 'stru');

    expect(screen.getByRole('progressbar', { name: 'Searching…' })).toBeOnTheScreen();
  });
});

describe('Explore: results', () => {
  it('lists the topics found; a ready one opens its detail, one being built does not', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(200, { topics: [STRUDEL, BUILDING, PROPOSED] })],
    });
    await search('s');

    expect(requests.filter((r) => r.path === '/topics')).toMatchObject([{ query: '?q=s' }]);
    expect(screen.getByText('SQL window functions')).toBeOnTheScreen();
    expect(screen.getByText('Being built')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open SQL window functions' })).toBeNull();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open C++ templates' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Open Strudel, Ready' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it.each([
    { levels: [level(2, 'ready', true), level(3, 'ready', true)], range: 'Levels 1–3' },
    { levels: [level(2, 'ready', true), level(3, 'ingesting', false)], range: 'Levels 1–2' },
  ])(
    'tags a root with published levels "$range"; an unpublished one does not count',
    async (row) => {
      const root = { ...STRUDEL, levels: [...STRUDEL.levels, ...row.levels] };
      await renderExplore({ 'GET /topics': [json(200, { topics: [root] })] });
      await search('s');

      expect(screen.getByText(row.range)).toBeOnTheScreen();
      const name = `Open Strudel, ${row.range}, Ready`;
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    },
  );

  it('shows no range on a root without published levels', async () => {
    const waiting = { ...STRUDEL, levels: [...STRUDEL.levels, level(2, 'ready', false)] };
    await renderExplore({ 'GET /topics': [json(200, { topics: [waiting] })] });
    await search('s');

    expect(screen.getByText('Strudel')).toBeOnTheScreen();
    expect(screen.queryByText(/^Levels? 1/)).toBeNull();
  });

  it('shows a failed search with Retry, which asks again', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(500, {}), json(200, { topics: [STRUDEL] })],
    });
    await search('strudel');
    expect(screen.getByText("Couldn't search topics.")).toBeOnTheScreen();

    await pressRetry();

    expect(requests.filter((r) => r.path === '/topics')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open Strudel, Ready' })).toBeOnTheScreen();
  });
});

describe('Explore: creating a topic', () => {
  it('offers Create for no match; a new topic shows its card, which opens once built', async () => {
    const requests = await renderExplore({
      'GET /topics': [json(200, { topics: [] }), json(200, { topics: [RUST] })],
      'POST /topics': [json(202, { topic: RUST, job_id: 'job-1' })],
      'GET /jobs/job-1': [job('running'), job('done')],
    });
    await search('  Rust ownership ');
    expect(screen.getByText('No topic matches that yet.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);
    expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
      query: 'Rust ownership',
    });
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
    const card = screen.getByRole('button', { name: 'Open Rust ownership' });
    expect(card).toBeDisabled();

    await advance(3000);
    expect(screen.getByText('Ready. Tap to open.')).toBeOnTheScreen();
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'rust-ownership' },
    });
  });

  it('says a proposed topic waits for approval once its sources are proposed', async () => {
    await renderExplore({
      'GET /topics': [json(200, { topics: [] }), json(200, { topics: [PROPOSED] })],
      'POST /topics': [json(202, { topic: PROPOSED, job_id: 'job-1' })],
      'GET /jobs/job-1': [job('done')],
    });
    await search('C++ templates');

    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);
    await advance(3000);

    expect(screen.getAllByText('Waiting for approval')).not.toHaveLength(0);
    expect(screen.queryByText('Ready. Tap to open.')).toBeNull();
  });

  it('opens a topic that already exists', async () => {
    await renderExplore({
      'GET /topics': [json(200, { topics: [] })],
      'POST /topics': [json(200, { topic: STRUDEL, job_id: null })],
    });
    await search('strudel.cc');
    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it.each([
    { status: 422, line: 'Not available yet' },
    { status: 429, line: 'You have too many topics being built. Try again later.' },
    { status: 500, line: "Couldn't create the topic. Try again." },
  ])('shows one fixed line for a $status', async ({ status, line }) => {
    await renderExplore({
      'GET /topics': [json(200, { topics: [] })],
      'POST /topics': [json(status, { detail: 'server text' })],
    });
    await search('cobol');
    fireEvent.press(screen.getByRole('button', { name: 'Create this topic' }));
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.queryByText('server text')).toBeNull();
  });
});

// How many times the enrollments were read.
const reads = (requests: { path: string }[]) =>
  requests.filter((r) => r.path === '/me/enrollments').length;
// The props of the list's pull-to-refresh control.
const refresher = () =>
  screen.UNSAFE_getByType(RefreshControl).props as { refreshing: boolean; onRefresh: () => void };

describe('Explore: my topics', () => {
  it('lists the learner’s topics above the idle line, most recent first; a row opens', async () => {
    await renderExplore({ 'GET /me/enrollments': [enrolled(OLDER, NEWER)] });

    expect(screen.getByRole('header', { name: 'My topics' })).toBeOnTheScreen();
    const ids = screen.getAllByTestId(/^my-topic-[a-z]+$/).map((row) => row.props.testID as string);
    expect(ids).toStrictEqual(['my-topic-sql', 'my-topic-strudel']);
    const lines = screen.getAllByText(/^(My topics|Search for a topic to learn\.)$/);
    expect(lines.map((line) => line.props.children as string)).toStrictEqual(['My topics', IDLE]);

    fireEvent.press(screen.getByTestId('my-topic-strudel'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it.each([
    { when: 'the learner has no topics', answer: enrolled() },
    { when: 'the first read is in flight', answer: new Promise<Response>(() => undefined) },
  ])('shows only the idle line when $when, with no heading or spinner', async ({ answer }) => {
    await renderExplore({ 'GET /me/enrollments': [answer] });

    expect(screen.getByText(IDLE)).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'My topics' })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByTestId('explore-my-topics-failed')).toBeNull();
    expect(refresher().refreshing).toBe(false);
  });

  it('shows one fixed line over the idle state when the topics cannot be read', async () => {
    await renderExplore({ 'GET /me/enrollments': [json(500, { detail: 'server text' })] });

    const failed = "Couldn't load your topics.";
    expect(screen.getByText(failed)).toHaveProp('testID', 'explore-my-topics-failed');
    expect(screen.getByText(IDLE)).toBeOnTheScreen();
    expect(screen.queryByText('server text')).toBeNull();
    expect(screen.queryByTestId('explore-my-topics')).toBeNull();
  });

  it('hides the list while a search is typed; cleared, shows it again from the cache', async () => {
    const requests = await renderExplore({
      'GET /me/enrollments': [enrolled(OLDER, NEWER)],
      'GET /topics': [json(200, { topics: [STRUDEL] })],
    });
    await search('str');
    expect(screen.queryByTestId('explore-my-topics')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Strudel, Ready' })).toBeOnTheScreen();

    await search('');
    expect(screen.getByTestId('explore-my-topics')).toBeOnTheScreen();
    expect(reads(requests)).toBe(1);
  });
});

describe('Explore: my topics, read again', () => {
  it('reads them again each time the tab regains focus, but not on its first focus', async () => {
    const invalidate = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    const requests = await renderExplore({ 'GET /me/enrollments': [enrolled(OLDER)] });
    expect(invalidate).not.toHaveBeenCalled();
    expect(reads(requests)).toBe(1);

    act(() => {
      setFocused(false);
    });
    act(() => {
      setFocused(true);
    });
    await advance(0);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ENROLLMENTS_KEY });
    expect(reads(requests)).toBe(2);
  });

  it('reads them again on pull to refresh, refreshing while the read is in flight', async () => {
    const later = Promise.withResolvers<Response>();
    await renderExplore({ 'GET /me/enrollments': [enrolled(OLDER), later.promise] });
    expect(refresher().refreshing).toBe(false);

    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await advance(0);
    expect(refresher().refreshing).toBe(true);

    later.resolve(enrolled(OLDER, NEWER));
    await advance(0);
    expect(refresher().refreshing).toBe(false);
    expect(screen.getByTestId('my-topic-sql')).toBeOnTheScreen();
  });
});
