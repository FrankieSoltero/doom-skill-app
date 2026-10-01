// The topic detail screen (app/topic/[slug].tsx), over the real API client and a fake network.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { useSession } from '../../../src/auth/useSession';
import { advance, renderScreen, SCREEN_TOP_INSET } from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { activeTopic, loadActiveTopic } from '../../../src/feed/useActiveTopic';
import { colors } from '../../../src/theme';
import TopicScreen from '../[slug]';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'strudel' }),
}));
jest.mock('../../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

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
  jest.useFakeTimers();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.back).mockClear();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
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

  it('shows a failed load with Retry, which asks again', async () => {
    const requests = await renderTopic({
      'GET /topics/strudel': [json(500, {}), json(200, READY)],
    });
    expect(screen.getByText("Couldn't load this topic.")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await advance(0);

    expect(requests).toHaveLength(2);
    expect(screen.getByRole('header', { name: 'Strudel' })).toBeOnTheScreen();
  });

  it('says a missing topic does not exist', async () => {
    await renderTopic({ 'GET /topics/strudel': [json(404, {})] });

    expect(screen.getByText('This topic does not exist.')).toBeOnTheScreen();
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
    expect(router.navigate).toHaveBeenCalledWith('/');
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
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
