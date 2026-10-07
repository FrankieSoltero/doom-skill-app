// The topic detail screen (app/topic/[slug].tsx), over the real API client and a fake network.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { useSession } from '../../../src/auth/useSession';
import {
  advance,
  pressRetry,
  renderScreen,
  SCREEN_TOP_INSET,
} from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { ApiError } from '../../../src/api/errors';
import type { Placement } from '../../../src/data';
import { useFeedStore } from '../../../src/feed/store';
import { cardsByType, makeSet } from '../../../src/feed/testing/sets';
import { activeTopic, loadActiveTopic } from '../../../src/feed/useActiveTopic';
import { colors } from '../../../src/theme';
import TopicScreen from '../[slug]';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'strudel' }),
}));
jest.mock('../../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
// The placement calls (src/data): null with the demo sets; a test sets them to stand for the API.
const mockData: { placement: Placement | null } = { placement: null };
jest.mock('../../../src/data', () => {
  const actual = jest.requireActual<typeof import('../../../src/data')>('../../../src/data');
  return Object.defineProperty({ ...actual }, 'placement', { get: () => mockData.placement });
});

const MILESTONES = [
  { id: 'm1', position: 1, title: 'First sounds' },
  { id: 'm2', position: 2, title: 'Mini-notation' },
];
const READY = {
  slug: 'strudel',
  title: 'Strudel',
  description: null,
  status: 'ready',
  end_state: 'Write a 16-bar layered piece from a blank editor.',
  milestones: MILESTONES,
};
const BUILDING = { ...READY, status: 'synthesizing', end_state: null, milestones: [] };
const ME = {
  id: 'u',
  display_name: null,
  daily_minutes: 15,
  push_time: null,
  timezone: 'UTC',
  created_at: '2026-09-28T12:00:00Z',
};
const ENROLLMENT = {
  topic_slug: 'strudel',
  topic_title: 'Strudel',
  status: 'active',
  daily_minutes: 15,
  horizon_days: 14,
  progress: 0,
  started_at: '2026-09-30T12:00:00Z',
};

beforeEach(async () => {
  mockData.placement = null;
  jest.useFakeTimers();
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.push).mockClear();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await AsyncStorage.clear();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  await loadActiveTopic();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderTopic(routes: Parameters<typeof serveApi>[0]) {
  const requests = serveApi(routes);
  await renderScreen(<TopicScreen />);
  return requests;
}

describe('Topic detail: states', () => {
  it('shows a busy line while the topic loads', async () => {
    await renderTopic({ 'GET /topics/strudel': [new Promise<Response>(() => undefined)] });

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });

  it('shows the title, the end state and the milestones, on paper below the inset', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    expect(screen.getByRole('header', { name: 'Strudel' })).toBeOnTheScreen();
    expect(screen.getByText(READY.end_state)).toBeOnTheScreen();
    expect(screen.getByLabelText('Milestone 1: First sounds')).toBeOnTheScreen();
    expect(screen.getByLabelText('Milestone 2: Mini-notation')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('milestone-number-2'))).toMatchObject({
      backgroundColor: colors.violet,
    });
    expect(viewStyleOf(screen.getByTestId('topic-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });

  it('says a topic still being built cannot start yet, with no Start button', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, BUILDING)] });

    expect(screen.getByText('This topic is still being built. Check back soon.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('says a proposed topic is waiting for approval, with no Start button', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, { ...BUILDING, status: 'proposed' })] });

    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(screen.queryByText('This topic is still being built. Check back soon.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('shows a failed load with Retry, which asks again', async () => {
    const requests = await renderTopic({
      'GET /topics/strudel': [json(500, {}), json(200, READY)],
    });
    expect(screen.getByText("Couldn't load this topic.")).toBeOnTheScreen();

    await pressRetry();

    expect(requests).toHaveLength(2);
    expect(screen.getByRole('header', { name: 'Strudel' })).toBeOnTheScreen();
  });

  it('says a missing topic does not exist', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(404, {})] });

    expect(screen.getByText('This topic does not exist.')).toBeOnTheScreen();
  });

  it('opens the leaderboard from a link under the milestones', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    // OutlineButton takes no testID: the link's section carries it, around the button.
    const section = screen.getByTestId('leaderboard-link');
    fireEvent.press(within(section).getByRole('button', { name: 'Leaderboard' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]/leaderboard',
      params: { slug: 'strudel' },
    });
  });

  it('goes back', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('Topic detail: Start', () => {
  it('enrolls for 14 days at the profile minutes, makes it active and opens Today', async () => {
    const requests = await renderTopic({
      'GET /topics/strudel': [json(200, READY)],
      'GET /me': [json(200, ME)],
      'POST /topics/strudel/enroll': [json(201, ENROLLMENT)],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(0);

    expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
      horizon_days: 14,
      daily_minutes: 15,
    });
    expect(activeTopic()).toBe('strudel');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it.each([
    { status: 409, line: 'This topic is still being built. Check back soon.' },
    { status: 500, line: "Couldn't start this topic. Try again." },
  ])('shows one fixed line when enrolling fails with a $status', async ({ status, line }) => {
    await renderTopic({
      'GET /topics/strudel': [json(200, READY)],
      'GET /me': [json(200, ME)],
      'POST /topics/strudel/enroll': [json(status, { detail: 'server text' })],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

/** Placement calls standing for the API: the set says `placed` (a 409) or serves a quiz. */
function withPlacement(placed: boolean) {
  const calls = {
    load: jest.fn<ReturnType<Placement['load']>, [string]>(() =>
      Promise.resolve(
        placed ? { kind: 'placed' } : { kind: 'quiz', quiz: { bands: [], cards: [] } },
      ),
    ),
    send: jest.fn<ReturnType<Placement['send']>, Parameters<Placement['send']>>(),
    reset: jest.fn<ReturnType<Placement['reset']>, [string]>(() => Promise.resolve('reset')),
  };
  mockData.placement = calls;
  return calls;
}

const START_ROUTES = {
  'GET /topics/strudel': [json(200, READY)],
  'GET /me': [json(200, ME)],
};

describe('Topic detail: placement (API)', () => {
  it('opens the placement quiz after a new enrollment, leaving the active topic to it', async () => {
    withPlacement(false);
    await renderTopic({ ...START_ROUTES, 'POST /topics/strudel/enroll': [json(201, ENROLLMENT)] });

    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(0);

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/topic/[slug]/placement',
      params: { slug: 'strudel' },
    });
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(activeTopic()).toBeNull();
  });

  it('opens Today when the learner was enrolled already (a 200)', async () => {
    withPlacement(false);
    await renderTopic({ ...START_ROUTES, 'POST /topics/strudel/enroll': [json(200, ENROLLMENT)] });

    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(0);

    expect(router.replace).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('offers no reset when the enrollment has no placement', async () => {
    const calls = withPlacement(false);
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    expect(calls.load).toHaveBeenCalledWith('strudel');
    expect(screen.queryByRole('button', { name: 'Start from the beginning' })).toBeNull();
  });

  it.each([
    { done: 'reset' as const, refreshed: true },
    { done: 'nothing' as const, refreshed: false },
  ])('on a $done, says so and stops offering it', async ({ done, refreshed }) => {
    await AsyncStorage.setItem('activeTopic', JSON.stringify({ owner: 'user-1', slug: 'strudel' }));
    await loadActiveTopic();
    useFeedStore.getState().startSet(makeSet(1, [cardsByType.concept]));
    const calls = withPlacement(true);
    calls.reset.mockResolvedValue(done);
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });
    calls.load.mockResolvedValue({ kind: 'quiz', quiz: { bands: [], cards: [] } });

    fireEvent.press(screen.getByRole('button', { name: 'Start from the beginning' }));
    await advance(0);

    expect(calls.reset).toHaveBeenCalledWith('strudel');
    expect(screen.getByText('Starting from the beginning.')).toBeOnTheScreen();
    expect(calls.load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Start from the beginning' })).toBeNull();
    // The server drops the topic's stored sets on a reset: the feed must ask again.
    expect(useFeedStore.getState().set === null).toBe(refreshed);
  });

  it.each([
    { outcome: () => Promise.resolve('limit' as const), line: 'You can reset again tomorrow.' },
    {
      outcome: () => Promise.reject(new ApiError('server', 500)),
      line: "Couldn't reset your starting point. Try again.",
    },
  ])('shows "$line" when the reset is refused', async ({ outcome, line }) => {
    const calls = withPlacement(true);
    calls.reset.mockImplementation(outcome);
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    fireEvent.press(screen.getByRole('button', { name: 'Start from the beginning' }));
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start from the beginning' })).toBeOnTheScreen();
  });

  it('asks nothing about placement with the demo sets', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(200, READY)] });

    expect(screen.queryByRole('button', { name: 'Start from the beginning' })).toBeNull();
  });
});
