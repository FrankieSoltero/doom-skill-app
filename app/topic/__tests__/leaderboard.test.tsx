// The topic leaderboard screen (app/topic/[slug]/leaderboard.tsx), over the real API client and a
// fake network.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import { useSession } from '../../../src/auth/useSession';
import { pressRetry, renderScreen } from '../../../src/components/testing/screen';
import LeaderboardScreen from '../[slug]/leaderboard';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'strudel' }),
}));
jest.mock('../../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const BOARD = {
  entries: [
    { rank: 1, display_name: 'Noor', points: 120 },
    { rank: 2, display_name: 'Grace', points: 95 },
  ],
  me: { rank: 7, points: 30 },
};
const EMPTY = { entries: [], me: null };
const ME = {
  id: 'u',
  display_name: 'Frankie',
  daily_minutes: 15,
  push_time: null,
  timezone: 'UTC',
  leaderboard_opt_in: true,
  created_at: '2026-09-28T12:00:00Z',
};
const NOT_OPTED_IN = { ...ME, leaderboard_opt_in: false };

const OPT_IN = 'Opt in on your profile to appear here.';
const YOU_NONE = 'Answer cards in this topic to get a rank.';

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.back).mockClear();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderBoard(routes: Parameters<typeof serveApi>[0]) {
  const requests = serveApi({ 'GET /me': [json(200, ME)], ...routes });
  await renderScreen(<LeaderboardScreen />);
  return requests;
}

describe('Leaderboard: loaded', () => {
  it('shows the header, a row per learner and the caller line', async () => {
    const requests = await renderBoard({ 'GET /topics/strudel/leaderboard': [json(200, BOARD)] });

    expect(requests.map((r) => r.path)).toContain('/topics/strudel/leaderboard');
    expect(screen.getByRole('header', { name: 'Leaderboard' })).toBeOnTheScreen();
    const rows = screen.getAllByTestId('leaderboard-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('#1Noor120 points');
    expect(rows[1]).toHaveTextContent('#2Grace95 points');
    expect(rows[0]).toHaveProp('accessibilityRole', 'text');
    expect(screen.getByText('You: #7 · 30 points')).toBeOnTheScreen();
    expect(screen.queryByText(YOU_NONE)).toBeNull();
    expect(screen.queryByText(OPT_IN)).toBeNull();
  });

  it('asks a caller who is not opted in to opt in, under the caller line', async () => {
    await renderBoard({
      'GET /topics/strudel/leaderboard': [json(200, BOARD)],
      'GET /me': [json(200, NOT_OPTED_IN)],
    });

    expect(screen.getByText('You: #7 · 30 points')).toBeOnTheScreen();
    expect(screen.getByText(OPT_IN)).toBeOnTheScreen();
  });

  it('shows the no-rank line then the opt-in line to a caller with no points, not opted in', async () => {
    await renderBoard({
      'GET /topics/strudel/leaderboard': [json(200, { ...BOARD, me: null })],
      'GET /me': [json(200, NOT_OPTED_IN)],
    });

    expect(screen.getByText(YOU_NONE)).toBeOnTheScreen();
    expect(screen.getByText(OPT_IN)).toBeOnTheScreen();
    expect(screen.queryByText(/^You: /)).toBeNull();
  });

  it.each([
    { state: 'loading', answer: new Promise<Response>(() => undefined) },
    { state: 'failed', answer: json(500, {}) },
  ])('leaves out the opt-in line while the profile is $state', async ({ answer }) => {
    await renderBoard({
      'GET /topics/strudel/leaderboard': [json(200, BOARD)],
      'GET /me': [answer],
    });

    expect(screen.getAllByTestId('leaderboard-row')).toHaveLength(2);
    expect(screen.queryByText(OPT_IN)).toBeNull();
  });

  it('goes back', async () => {
    await renderBoard({ 'GET /topics/strudel/leaderboard': [json(200, BOARD)] });

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('Leaderboard: empty and errors', () => {
  it('says the board is empty', async () => {
    await renderBoard({ 'GET /topics/strudel/leaderboard': [json(200, EMPTY)] });

    expect(screen.getByText('No points yet — answer cards to earn some.')).toBeOnTheScreen();
    expect(screen.queryByTestId('leaderboard-row')).toBeNull();
    expect(screen.getByText(YOU_NONE)).toBeOnTheScreen();
  });

  it('shows a busy line while the board loads', async () => {
    await renderBoard({
      'GET /topics/strudel/leaderboard': [new Promise<Response>(() => undefined)],
    });

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });

  it('shows a failed load with Retry, which asks again', async () => {
    const requests = await renderBoard({
      'GET /topics/strudel/leaderboard': [json(500, {}), json(200, BOARD)],
    });
    expect(screen.getByText("Couldn't load the leaderboard.")).toBeOnTheScreen();

    await pressRetry();

    expect(requests.filter((r) => r.path === '/topics/strudel/leaderboard')).toHaveLength(2);
    expect(screen.getAllByTestId('leaderboard-row')).toHaveLength(2);
  });

  it('says a missing topic does not exist', async () => {
    await renderBoard({ 'GET /topics/strudel/leaderboard': [json(404, {})] });

    expect(screen.getByText('This topic does not exist.')).toBeOnTheScreen();
    expect(screen.queryByTestId('leaderboard-row')).toBeNull();
  });
});
