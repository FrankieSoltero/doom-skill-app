// The placement screen (app/topic/[slug]/placement.tsx) over a mocked placement data layer: the
// network calls themselves are tested in src/data/__tests__/apiPlacement.test.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ApiError } from '../../../src/api/errors';
import { useSession } from '../../../src/auth/useSession';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { placement, type PlacementQuiz } from '../../../src/data';
import { useFeedStore } from '../../../src/feed/store';
import { cardsByType, makeSet } from '../../../src/feed/testing/sets';
import { activeTopic, loadActiveTopic } from '../../../src/feed/useActiveTopic';
import { logError, logWarning } from '../../../src/log';
import { PICK_GUARD_MS } from '../../../src/placement/usePlacement';
import PlacementScreen from '../[slug]/placement';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('expo-router', () => ({
  router: { dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'strudel' }),
  Stack: { Screen: () => null },
}));
jest.mock('../../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('../../../src/data', () => {
  const actual = jest.requireActual<typeof import('../../../src/data')>('../../../src/data');
  return { ...actual, placement: { load: jest.fn(), send: jest.fn(), reset: jest.fn() } };
});

const QUIZ_ID = '00000000-0000-4000-8000-000000000501';
const PREDICT_ID = '00000000-0000-4000-8000-000000000502';

const BANDS = [
  { milestone: 1, title: 'First sounds' },
  { milestone: 2, title: 'Mini-notation' },
];
const QUIZ: PlacementQuiz = {
  bands: BANDS,
  cards: [
    {
      id: QUIZ_ID,
      type: 'quiz',
      milestone: 1,
      bandIndex: 0,
      title: 'Which call plays a sample?',
      prompt: null,
      options: ['s("bd")', 'note("c3")'],
    },
    {
      id: PREDICT_ID,
      type: 'predict',
      milestone: 2,
      bandIndex: 1,
      title: 'How many steps per cycle?',
      prompt: 's("bd*4")',
      options: ['2', '4', '8'],
    },
  ],
};

/** The answer to a placement that passed no band, or to a skip. */
const FROM_THE_START = {
  kind: 'result',
  result: { placed: 0, bands: 2, knownNodes: 0, milestoneTitle: null },
} as const;

/** The mocked placement calls. */
function calls() {
  if (placement === null) throw new Error('placement is mocked');
  return {
    load: jest.mocked(placement.load),
    send: jest.mocked(placement.send),
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(logWarning).mockClear();
  jest.mocked(logError).mockClear();
  calls().load.mockReset();
  calls().send.mockReset();
  await AsyncStorage.clear();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await loadActiveTopic();
});

afterEach(() => {
  jest.useRealTimers();
});

async function open(quiz: PlacementQuiz = QUIZ) {
  calls().load.mockResolvedValue({ kind: 'quiz', quiz });
  await renderScreen(<PlacementScreen />);
}

async function press(name: string) {
  fireEvent.press(screen.getByRole('button', { name }));
  await advance(0);
}

/**
 * Picks the option `name` once the card has been shown longer than the double-tap guard (its own
 * tests: src/placement/__tests__/usePlacement.test.tsx).
 */
async function pick(name: string) {
  await advance(PICK_GUARD_MS);
  await press(name);
}

/** Opens the quiz, starts it and picks `first` then `second`. */
async function answerBoth(first: string, second: string) {
  await open();
  await press('Start');
  await pick(first);
  await pick(second);
}

/** Makes the topic active already, with a set of its feed loaded. */
async function activeWithSet() {
  await AsyncStorage.setItem('activeTopic', JSON.stringify({ owner: 'user-1', slug: 'strudel' }));
  await loadActiveTopic();
  useFeedStore.getState().startSet(makeSet(1, [cardsByType.concept]));
}

/** The feed opened on the topic: it is the active topic and the stack went back to Today. */
function expectFeedOpened() {
  expect(activeTopic()).toBe('strudel');
  expect(router.dismissTo).toHaveBeenCalledWith('/');
}

describe('Placement: intro', () => {
  it('shows the title, the number of questions, Start and Skip', async () => {
    await open();

    expect(calls().load).toHaveBeenCalledWith('strudel');
    expect(screen.getByRole('header', { name: 'Quick check' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        '2 questions to find your starting point. You can skip and start from the beginning.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeOnTheScreen();
    expect(activeTopic()).toBeNull();
  });

  it('shows a busy line while the set loads', async () => {
    calls().load.mockReturnValue(new Promise(() => undefined));
    await renderScreen(<PlacementScreen />);

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });
});

describe('Placement: cards', () => {
  it('shows one card at a time with its progress line and no answer', async () => {
    await open();
    await press('Start');

    expect(screen.getByText('1 of 2')).toBeOnTheScreen();
    expect(screen.getByText('Which call plays a sample?')).toBeOnTheScreen();
    expect(screen.queryByText('How many steps per cycle?')).toBeNull();
    await pick('s("bd")');

    expect(screen.getByText('2 of 2')).toBeOnTheScreen();
    expect(screen.getByText('How many steps per cycle?')).toBeOnTheScreen();
    expect(screen.queryByText('Which call plays a sample?')).toBeNull();
    expect(screen.queryByLabelText(/Correct answer|Not correct/)).toBeNull();
    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(calls().send).not.toHaveBeenCalled();
  });

  it("shows a predict card's code", async () => {
    await open();
    await press('Start');
    await pick('s("bd")');

    expect(screen.getByTestId('code-block-code')).toHaveTextContent('s("bd*4")');
  });
});

describe('Placement: submit', () => {
  it('posts every answer, then shows where the learner starts and opens the feed', async () => {
    calls().send.mockResolvedValue({
      kind: 'result',
      result: { placed: 1, bands: 2, knownNodes: 3, milestoneTitle: 'Mini-notation' },
    });
    await answerBoth('note("c3")', '8');

    expect(calls().send).toHaveBeenCalledTimes(1);
    expect(calls().send).toHaveBeenCalledWith('strudel', {
      answers: [
        { cardId: QUIZ_ID, choice: 1 },
        { cardId: PREDICT_ID, choice: 2 },
      ],
    });
    expect(screen.getByText('Starting at milestone 2: Mini-notation')).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(activeTopic()).toBeNull();

    await press("Go to today's set");

    expectFeedOpened();
  });

  it("names the last band's milestone for a placement stored with every band passed", async () => {
    // The server no longer passes the last band (K19, M8 final review I1); a result stored before
    // that rule still names the last band.
    calls().send.mockResolvedValue({
      kind: 'result',
      result: { placed: 2, bands: 2, knownNodes: 5, milestoneTitle: 'Mini-notation' },
    });
    await answerBoth('s("bd")', '4');

    expect(screen.getByText('Starting at milestone 2: Mini-notation')).toBeOnTheScreen();
  });

  it('says the learner starts from the beginning when no band passed', async () => {
    calls().send.mockResolvedValue(FROM_THE_START);
    await answerBoth('note("c3")', '2');

    expect(screen.getByText('Starting from the beginning')).toBeOnTheScreen();
  });

  it('writes no answer to storage or to a log', async () => {
    const write = jest.spyOn(AsyncStorage, 'setItem');
    write.mockClear();
    calls().send.mockResolvedValue(FROM_THE_START);
    await answerBoth('note("c3")', '2');
    await press("Go to today's set");

    expect(write.mock.calls.map(([key]) => key)).toStrictEqual(['activeTopic']);
    expect(logWarning).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('Placement: skip', () => {
  it('posts a skip and shows the start from the beginning', async () => {
    calls().send.mockResolvedValue(FROM_THE_START);
    await open();
    await press('Skip');

    expect(calls().send).toHaveBeenCalledWith('strudel', { skip: true });
    expect(screen.getByText('Starting from the beginning')).toBeOnTheScreen();
    await press("Go to today's set");

    expectFeedOpened();
  });

  it('skips the quiz silently when the set has no card', async () => {
    calls().send.mockResolvedValue(FROM_THE_START);
    await open({ bands: BANDS, cards: [] });

    expect(calls().send).toHaveBeenCalledWith('strudel', { skip: true });
    expect(screen.queryByText('Quick check')).toBeNull();
    expectFeedOpened();
  });

  it('shows the fixed line when the silent skip fails', async () => {
    calls().send.mockRejectedValue(new ApiError('server', 500));
    await open({ bands: BANDS, cards: [] });

    expect(
      screen.getByText('Could not save your starting point. Starting from the beginning.'),
    ).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

describe('Placement: the feed afterwards', () => {
  it.each([
    { name: 'a placement', submit: () => answerBoth('s("bd")', '4') },
    { name: 'a skip', submit: () => open().then(() => press('Skip')) },
  ])("drops the topic's loaded set after $name, so the feed asks again", async ({ submit }) => {
    await activeWithSet();
    calls().send.mockResolvedValue(FROM_THE_START);
    await submit();
    await press("Go to today's set");

    expect(useFeedStore.getState().set).toBeNull();
    expectFeedOpened();
  });

  it('drops it after the silent skip of a set with no card', async () => {
    await activeWithSet();
    calls().send.mockResolvedValue(FROM_THE_START);
    await open({ bands: BANDS, cards: [] });

    expect(useFeedStore.getState().set).toBeNull();
  });

  it('keeps it when the topic was placed already: the server dropped nothing', async () => {
    await activeWithSet();
    calls().load.mockResolvedValue({ kind: 'placed' });
    await renderScreen(<PlacementScreen />);

    expectFeedOpened();
    expect(useFeedStore.getState().set).not.toBeNull();
  });

  it('keeps it when the answers failed to save', async () => {
    await activeWithSet();
    calls().send.mockRejectedValue(new ApiError('server', 500));
    await answerBoth('s("bd")', '4');
    await press("Go to today's set");

    expectFeedOpened();
    expect(useFeedStore.getState().set).not.toBeNull();
  });
});

describe('Placement: errors', () => {
  it('opens the feed at once when the set says placed already (a 409)', async () => {
    calls().load.mockResolvedValue({ kind: 'placed' });
    await renderScreen(<PlacementScreen />);

    expect(screen.queryByText('Quick check')).toBeNull();
    expectFeedOpened();
  });

  it('opens the feed at once when the answers meet a 409', async () => {
    calls().send.mockResolvedValue({ kind: 'placed' });
    await answerBoth('s("bd")', '4');

    expect(screen.queryByText(/Starting/)).toBeNull();
    expectFeedOpened();
  });

  it('shows the fixed line and the way to the feed when the set fails to load', async () => {
    calls().load.mockRejectedValue(new ApiError('server', 500));
    await renderScreen(<PlacementScreen />);

    expect(
      screen.getByText('Could not save your starting point. Starting from the beginning.'),
    ).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
    await press("Go to today's set");

    expectFeedOpened();
  });

  it('shows the fixed line when the answers fail to save', async () => {
    calls().send.mockRejectedValue(new ApiError('offline', 0));
    await answerBoth('s("bd")', '4');

    expect(
      screen.getByText('Could not save your starting point. Starting from the beginning.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Starting at milestone/)).toBeNull();
  });
});
