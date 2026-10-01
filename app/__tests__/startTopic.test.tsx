// Starting a topic from its detail screen, through the app's routes, its API card source and the
// real API client over a fake network: one Today feed is mounted, so it asks for the day's set
// once, its Summary asks for the recorded summary once, and an exercise card has one Strudel
// player. Nothing leaves the test.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { queryClient } from '../../src/api/query';
import { useSession } from '../../src/auth/useSession';
import { useFeedStore } from '../../src/feed/store';
import { loadActiveTopic } from '../../src/feed/useActiveTopic';
import { mountedWebViews } from '../../src/strudel/__mocks__/webview';
import TabsLayout from '../(tabs)/_layout';
import ExploreScreen from '../(tabs)/explore';
import TodayScreen from '../(tabs)/index';
import ProfileScreen from '../(tabs)/profile';
import TreeScreen from '../(tabs)/tree';
import TopicScreen from '../topic/[slug]';

// Read by the mocked modules when they load.
const mockSend = jest.fn<Promise<Response>, [Request]>();

jest.mock('../../src/config', () => {
  const actual = jest.requireActual<typeof import('../../src/config')>('../../src/config');
  return { ...actual, config: { ...actual.config, dataSource: 'api' }, configError: null };
});
jest.mock('../../src/auth/supabase', () => ({ supabase: null, SESSION_STORAGE_KEY: 'session' }));
jest.mock('../../src/api/client', () => {
  const actual = jest.requireActual<typeof import('../../src/api/client')>('../../src/api/client');
  const api = actual.createApiClient({
    baseUrl: 'https://api.test',
    send: (request) => mockSend(request),
    sleep: () => Promise.resolve(),
    getAccessToken: () => Promise.resolve('token-marker'),
    refreshSession: () => Promise.resolve(false),
    signOut: () => Promise.resolve(),
  });
  return { ...actual, api };
});
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));
jest.mock('../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

// After the mocks, so the layout reads the mocked configuration.
const RootLayout = jest.requireActual<typeof import('../_layout')>('../_layout').default;

// Loaded after the screens: its setup replaces Reanimated with the library's older mock, which
// lacks the hooks the feed pager uses; the screens loaded first keep the real module, as in the
// feed's own tests (jest.setup.js).
const { renderRouter } = jest.requireActual<typeof import('expo-router/testing-library')>(
  'expo-router/testing-library',
);

const ROUTES = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': TodayScreen,
  '(tabs)/tree': TreeScreen,
  '(tabs)/explore': ExploreScreen,
  '(tabs)/profile': ProfileScreen,
  'topic/[slug]': TopicScreen,
};

const TOPIC = {
  slug: 'strudel',
  title: 'Strudel',
  description: null,
  status: 'ready',
  end_state: 'Write a 16-bar layered piece from a blank editor.',
  milestones: [{ id: 'm1', position: 1, title: 'First sounds' }],
};
const ME = {
  id: 'u',
  display_name: null,
  daily_minutes: 15,
  push_time: null,
  timezone: 'UTC',
  created_at: '2026-09-28T12:00:00Z',
};

const SUMMARY = {
  title: '1 card. 1 minute.',
  progress_delta: 5,
  progress_after: 0.05,
  moved: [],
  tomorrow: 'New material',
  reminder: null,
};
/** The day's set, as `GET /feed/today` writes it: one concept card. */
const SET = {
  topic: { slug: 'strudel', title: 'Strudel', day: 1, horizon_days: 14, streak: 0, progress: 0 },
  set_number: 1,
  feed_date: '2026-09-30',
  cards: [
    {
      id: '00000000-0000-4000-8000-000000000302',
      node: 'Alternation < >',
      est_seconds: 45,
      type: 'concept',
      title: 'Alternate with angle brackets',
      body: 'Wrap steps in **< >** and Strudel plays one of them per cycle.',
      snippet: 'note("<c3 e3 g3>")',
      snippet_comment: 'one note per cycle',
      cycles: ['c3', 'e3', 'g3'],
    },
  ],
  summary: SUMMARY,
};

/** A day's set of one exercise card, as `GET /feed/today` writes it. */
const EXERCISE_SET = {
  ...SET,
  cards: [
    {
      id: '00000000-0000-4000-8000-000000000306',
      node: 'Speed * and /',
      est_seconds: 90,
      type: 'exercise',
      lang: 'strudel',
      title: 'Double the hi-hats to eight per cycle',
      starter_code: 's("hh*4")',
      checks: [{ kind: 'contains', value: 'hh*8', ignore_whitespace: true }],
      pass_msg: 'Eight per cycle.',
      fail_msg: 'Not eight yet.',
    },
  ],
};

/** What `GET /feed/today` answers in the current test. */
let today: object = SET;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The answer for each route, by method and path; every request is counted by the same key. */
const ANSWERS: Record<string, () => Response> = {
  'GET /topics/strudel': () => json(200, TOPIC),
  'GET /me': () => json(200, ME),
  'POST /topics/strudel/enroll': () => json(201, {}),
  'GET /feed/today': () => json(200, today),
  // The app's card source outlives a test: once it has served the topic, it asks for the next set.
  'GET /feed/next': () => json(200, today),
  'GET /feed/summary': () => json(200, SUMMARY),
};

/** The requests for a set: the first of the day, or the next one. */
function setRequests(): number {
  return sentTo('GET /feed/today') + sentTo('GET /feed/next');
}

function sentTo(route: string): number {
  return mockSend.mock.calls.filter(([request]) => {
    const { pathname } = new URL(request.url);
    return `${request.method} ${pathname}` === route;
  }).length;
}

/** Renders the app's routes at `url`, opens the topic and presses Start. */
async function startFrom(url: string): Promise<void> {
  renderRouter(ROUTES, { initialUrl: url });
  act(() => {
    router.push('/topic/strudel');
  });
  fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
}

/**
 * Waits until no Today feed is loading, then gives every feed pager a size: a pager draws its
 * pages once it has one.
 */
async function layOutPagers(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryAllByTestId('feed-loading', HIDDEN)).toHaveLength(0);
    expect(screen.queryAllByTestId('feed-pager', HIDDEN).length).toBeGreaterThan(0);
  });
  for (const pager of screen.getAllByTestId('feed-pager', HIDDEN)) {
    fireEvent(pager, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
    });
  }
}

const HIDDEN = { includeHiddenElements: true };

beforeEach(async () => {
  today = SET;
  mockSend.mockReset();
  mockSend.mockImplementation((request) => {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    const answer = route.startsWith('POST /cards/') ? () => json(200, {}) : ANSWERS[route];
    return Promise.resolve(answer === undefined ? json(404, { detail: 'Not found' }) : answer());
  });
  // Each test starts with no topic chosen and an empty server-state cache.
  queryClient.clear();
  await AsyncStorage.clear();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await loadActiveTopic();
});

describe('starting a topic', () => {
  it('asks for the day set once and, at the Summary, for the recorded summary once', async () => {
    await startFrom('/');

    await layOutPagers();
    const [gotIt, ...others] = await screen.findAllByRole('button', { name: 'Got it' });
    expect(setRequests()).toBe(1);
    expect(others).toHaveLength(0);
    if (gotIt === undefined) throw new Error('The concept card is not shown');
    fireEvent.press(gotIt);
    // Kept once its answer arrives; every request for it has been sent by then.
    await waitFor(() => {
      expect(useFeedStore.getState().recordedSummary).not.toBeNull();
    });
    expect(setRequests()).toBe(1);
    expect(sentTo('GET /feed/summary')).toBe(1);
  });

  it('from the Explore tab, closes the topic and shows the Today tab, once', async () => {
    await startFrom('/explore');

    expect(await screen.findByTestId('today-screen')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('today-screen', HIDDEN)).toHaveLength(1);
    expect(screen.queryByTestId('topic-screen', HIDDEN)).toBeNull();
  });

  // The simulator run's one strudel_unavailable timeout: the second Today feed, under the topic
  // screen, mounted a second player for the same exercise card, in a screen the stack had covered.
  it('mounts one Strudel player for an exercise card', async () => {
    today = EXERCISE_SET;
    await startFrom('/');

    await layOutPagers();
    await screen.findAllByTestId('strudel-player', HIDDEN);

    expect(mountedWebViews()).toHaveLength(1);
  });
});
