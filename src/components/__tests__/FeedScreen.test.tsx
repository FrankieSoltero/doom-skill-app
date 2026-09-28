import { act, fireEvent, screen, within } from '@testing-library/react-native';

import type { Card } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { scriptedSource } from '../../feed/testing/sources';
import { logError, logWarning } from '../../log';
import { cardTheme, colors } from '../../theme';
import { renderFeed, stubCard, stubNext, stubText } from '../testing/feed';
import { advance, HIDDEN, layout, settle, swipe } from '../testing/pager';
import { viewStyleOf } from '../testing/styles';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, predict, exercise } = cardsByType;

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Renders the feed over one set of `cards`, drawn by `drawCard`, and lays the pager out. */
async function renderSet(cards: Card[], drawCard: typeof stubCard = stubCard) {
  await renderFeed(scriptedSource(makeSet(12, cards)), drawCard);
  await layout(700);
}

/** A card component that fails to render. */
function Broken(): never {
  throw new Error('card broke');
}

const shownIndex = () => useFeedStore.getState().index;

/** Presses the stand-in card's button on page `index`, which calls its `onNext`. */
async function pressNext(index: number) {
  fireEvent.press(screen.getByRole('button', { name: stubNext(index) }));
  await settle();
}

describe('FeedScreen pages', () => {
  it('skips a card type with no component: not a page, not a segment', async () => {
    await renderFeed(scriptedSource(makeSet(12, [quiz, concept, predict])));
    await layout(700);

    expect(screen.getAllByTestId('progress-segment')).toHaveLength(1);
    expect(screen.getByTestId('feed-page-0')).toHaveTextContent(concept.title, { exact: false });
    expect(screen.getByTestId('feed-page-1', HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId('feed-page-2', HIDDEN)).toBeNull();
    expect(logWarning).toHaveBeenCalledWith('card_type_skipped', { type: 'quiz' });
  });

  it('ends with the Summary page, a placeholder with no text', async () => {
    await renderSet([concept, quiz]);

    const summary = within(screen.getByTestId('feed-page-2', HIDDEN)).getByTestId(
      'summary-page',
      HIDDEN,
    );
    expect(summary).toHaveTextContent('', { exact: true });
  });

  it('gives active only to the page at the index, and follows the index', async () => {
    await renderSet([concept, concept, quiz]);

    expect(screen.getByText(stubText('concept', 0, true))).toBeOnTheScreen();
    expect(screen.getByText(stubText('concept', 1, false), HIDDEN)).toBeOnTheScreen();
    await swipe(-80);

    expect(screen.getByText(stubText('concept', 0, false), HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText(stubText('concept', 1, true))).toBeOnTheScreen();
    expect(screen.getByText(stubText('quiz', 2, false), HIDDEN)).toBeOnTheScreen();
  });

  it('shows the streak from the store in the header', async () => {
    await renderSet([concept]);

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('12');
    act(() => {
      useFeedStore.setState({ streak: 13 });
    });
    expect(screen.getByTestId('streak-chip')).toHaveTextContent('13');
  });
});

describe('FeedScreen moves', () => {
  it('a swipe up on an unanswered card shows the toast for 1,400 ms and stays', async () => {
    await renderSet([quiz, concept]);

    await swipe(-80);

    expect(shownIndex()).toBe(0);
    expect(screen.getByText('Answer this card to continue')).toBeOnTheScreen();
    advance(1399);
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
    advance(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it("a card's onNext moves one page on when it is answered", async () => {
    await renderSet([concept, quiz]);

    await pressNext(0);

    expect(shownIndex()).toBe(1);
  });

  it("a card's onNext on an unanswered card stays and shows the toast", async () => {
    await renderSet([quiz, concept]);

    await pressNext(0);

    expect(shownIndex()).toBe(0);
    expect(screen.getByTestId('toast')).toBeOnTheScreen();
  });

  it('reaching the Summary adds the set to the day once', async () => {
    await renderSet([concept]);

    await pressNext(0);

    expect(useFeedStore.getState()).toMatchObject({ index: 1, streak: 13 });
    expect(useFeedStore.getState().totals.cards).toBe(1);
  });
});

describe('FeedScreen card failure', () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    // React reports every error a boundary catches through console.error; keep the run quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  /** Draws every card as `stubCard`, except that the card at page 1 throws while rendering. */
  const breakPageOne: typeof stubCard = (card, slot) =>
    slot.index === 1 ? <Broken /> : stubCard(card, slot);

  it('shows a fallback card on that page; the other pages still work', async () => {
    await renderSet([concept, quiz, concept], breakPageOne);

    const failed = screen.getByTestId('feed-page-1', HIDDEN);
    expect(within(failed).getByTestId('card-frame', HIDDEN)).toBeOnTheScreen();
    expect(failed).toHaveTextContent("QuizThis card couldn't be shown.Next card");
    expect(screen.getByText(stubText('concept', 0, true))).toBeOnTheScreen();
    expect(screen.getByText(stubText('concept', 2, false), HIDDEN)).toBeOnTheScreen();
    expect(logError).toHaveBeenCalledWith('render_failed', expect.any(Error), { boundary: 'card' });
  });

  it("draws the fallback in the card's colors: a paper button on an exercise card", async () => {
    await renderSet([concept, exercise], breakPageOne);

    const failed = screen.getByTestId('feed-page-1', HIDDEN);
    const body = within(failed).getByTestId('card-frame-body', HIDDEN);
    expect(viewStyleOf(body).backgroundColor).toBe(cardTheme.exercise.bg);
    const face = within(failed).getByTestId('primary-button-face', HIDDEN);
    expect(viewStyleOf(face).backgroundColor).toBe(colors.paper);
  });

  it('counts the failed card as answered: swipe past it, or press Next card', async () => {
    await renderSet([concept, quiz, concept], breakPageOne);

    await swipe(-80);
    expect(shownIndex()).toBe(1);
    await swipe(-80);
    expect(shownIndex()).toBe(2);
    await swipe(80);

    fireEvent.press(screen.getByRole('button', { name: 'Next card' }));
    await settle();
    expect(shownIndex()).toBe(2);
  });
});
