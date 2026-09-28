// The session loop on the Today screen: finish a set, reach its Summary, press Keep going, and
// work through the next set, as many times as the source has sets.
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';

import type { renderCard } from '../../src/cards/registry';
import { FeedScreen } from '../../src/components/FeedScreen';
import {
  answeringCard,
  renderWithInsets,
  stubNext,
  stubText,
} from '../../src/components/testing/feed';
import { HIDDEN, layout, settle, swipe } from '../../src/components/testing/pager';
import { viewStyleOf } from '../../src/components/testing/styles';
import type { FeedSet } from '../../src/data';
import { useFeedStore } from '../../src/feed/store';
import { cardsByType, makeSet } from '../../src/feed/testing/sets';
import { controlledSource } from '../../src/feed/testing/sources';
import { logError } from '../../src/log';
import { cardTheme } from '../../src/theme';

jest.mock('../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const { quiz, concept } = cardsByType;
// Set 1: a quiz (20 s) and a concept (30 s). Set 2: the same cards, as the demo sets loop.
const firstSet: FeedSet = makeSet(12, [quiz, concept]);
const secondSet: FeedSet = { ...makeSet(12, [quiz, concept]), setNumber: 2 };

const store = () => useFeedStore.getState();
const button = (name: string) => screen.getByRole('button', { name });

/** Every card page that unmounted, as `set <setNumber> page <index>`. */
let unmounted: string[] = [];

/** Records its page when it unmounts. */
function Tracked({ page }: { page: string }) {
  useEffect(
    () => () => {
      unmounted.push(page);
    },
    [page],
  );
  return null;
}

/** Draws each card as a stand-in that answers and moves on, and records when it unmounts. */
const drawCard: typeof renderCard = (card, slot) => (
  <>
    {answeringCard(0)(card, slot)}
    <Tracked page={`set ${String(store().set?.setNumber)} page ${String(slot.index)}`} />
  </>
);

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
  unmounted = [];
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Renders the screen over a controlled source, gives it `firstSet`, and lays the pager out. */
async function renderLoop(onViewTree?: () => void) {
  const source = controlledSource();
  const viewTree = onViewTree === undefined ? {} : { onViewTree };
  await renderWithInsets(
    <FeedScreen source={source} renderCard={drawCard} canRenderCard={() => true} {...viewTree} />,
  );
  source.resolve(firstSet);
  await settle();
  await layout(700);
  return source;
}

/** Answers and moves on from each card of the current set, which ends on its Summary. */
async function finishSet() {
  for (const index of [0, 1]) {
    fireEvent.press(button(stubNext(index)));
    await settle();
  }
  expect(store().index).toBe(2);
}

/** Presses the lime button (Keep going or Retry) and lets the press settle. */
async function press(name: string) {
  fireEvent.press(button(name));
  await settle();
}

describe('Keep going', () => {
  it('adds the set to the day once, then starts the next set on its first card', async () => {
    const source = await renderLoop();
    await finishSet();

    expect(store()).toMatchObject({ totals: { cards: 2, seconds: 50 }, streak: 13 });
    expect(screen.getByRole('header', { name: 'Two cards. One minute.' })).toBeOnTheScreen();
    await swipe(80);
    await swipe(-80);
    expect(store()).toMatchObject({ index: 2, totals: { cards: 2, seconds: 50 }, streak: 13 });

    await press('Keep going');
    expect(button('Loading…')).toBeDisabled();
    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    source.resolve(secondSet);
    await settle();

    expect(store()).toMatchObject({ index: 0, answers: {}, round: 2 });
    expect(store()).toMatchObject({ totals: { cards: 2, seconds: 50 }, streak: 13 });
    const header = screen.getByTestId('feed-header');
    expect(within(header).getByText('STRUDEL · DAY 1 OF 30 · SET 2')).toBeOnTheScreen();
    expect(within(header).getByTestId('streak-chip')).toHaveTextContent('13');
    const fills = screen.getAllByTestId('progress-segment').map(viewStyleOf);
    expect(fills.map((fill) => fill.backgroundColor)).toStrictEqual([
      cardTheme.quiz.bg,
      'transparent',
    ]);
    expect(
      within(screen.getByTestId('feed-page-0')).getByText(stubText('quiz', 0, true)),
    ).toBeOnTheScreen();
    expect(unmounted).toStrictEqual(['set 1 page 0', 'set 1 page 1']);
  });

  it('counts every set in the next Summary, and says when there are no more sets', async () => {
    const source = await renderLoop();
    await finishSet();
    await press('Keep going');
    source.resolve(secondSet);
    await settle();

    await finishSet();
    expect(store()).toMatchObject({ totals: { cards: 4, seconds: 100 }, streak: 13 });
    expect(screen.getByRole('header', { name: 'Four cards. Two minutes.' })).toBeOnTheScreen();

    await press('Keep going');
    source.resolve(null);
    await settle();

    expect(screen.getByText("That's everything for now.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Keep going' })).toBeNull();
    expect(store()).toMatchObject({ set: secondSet, index: 2 });
  });

  it('shows the error line after a failed load, and Retry loads the next set', async () => {
    const source = await renderLoop();
    await finishSet();
    await press('Keep going');
    const failure = new Error('offline');
    source.reject(failure);
    await settle();

    expect(screen.getByText("Couldn't load more cards.")).toBeOnTheScreen();
    expect(logError).toHaveBeenCalledWith('next_set_load_failed', failure);
    expect(store().answers).toStrictEqual({
      0: { kind: 'choice', picked: 0 },
      1: { kind: 'choice', picked: 0 },
    });
    await press('Retry');
    expect(source.getNextSet).toHaveBeenCalledTimes(3);
    source.resolve(secondSet);
    await settle();

    expect(screen.getByText('STRUDEL · DAY 1 OF 30 · SET 2')).toBeOnTheScreen();
    expect(store().index).toBe(0);
  });
});

describe('View skill tree', () => {
  it('calls the onViewTree it is given, once', async () => {
    const onViewTree = jest.fn<undefined, []>();
    const navigate = jest.spyOn(router, 'navigate').mockReturnValue(undefined);
    await renderLoop(onViewTree);
    await finishSet();

    await press('View skill tree');

    expect(onViewTree).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('switches to the Tree tab by default, through the router', async () => {
    const navigate = jest.spyOn(router, 'navigate').mockReturnValue(undefined);
    await renderLoop();
    await finishSet();

    await press('View skill tree');

    expect(navigate.mock.calls).toStrictEqual([['/tree']]);
    expect(screen.getByTestId('feed-page-2', HIDDEN)).toBeOnTheScreen();
  });
});
