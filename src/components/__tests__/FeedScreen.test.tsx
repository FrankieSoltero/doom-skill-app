import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { canRenderCard, renderCard } from '../../cards/registry';
import type { Card, CardSource } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { controlledSource, scriptedSource } from '../../feed/testing/sources';
import { logError, logWarning } from '../../log';
import { cardTheme, colors } from '../../theme';
import { FeedScreen } from '../FeedScreen';
import {
  answeringCard,
  renderFeed,
  renderWithInsets,
  stubCard,
  stubNext,
  stubText,
} from '../testing/feed';
import { advance, HIDDEN, layout, settle, swipe } from '../testing/pager';
import { viewStyleOf } from '../testing/styles';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, exercise, checkpoint } = cardsByType;

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
async function renderSet(cards: Card[], drawCard: Parameters<typeof renderFeed>[1] = stubCard) {
  await renderFeed(scriptedSource(makeSet(12, cards)), drawCard);
  await layout(700);
}

/** What `Broken` throws. */
const cardBroke = new Error('card broke');

/** A card component that fails to render. */
function Broken(): never {
  throw cardBroke;
}

const shownIndex = () => useFeedStore.getState().index;

/** Presses the stand-in card's button on page `index`, which calls its `onNext`. */
async function pressNext(index: number) {
  fireEvent.press(screen.getByRole('button', { name: stubNext(index) }));
  await settle();
}

describe('FeedScreen pages', () => {
  it('skips a card type with no component: not a page, not a segment', async () => {
    // Every type is registered now, so the screen gets a registry that lacks the checkpoint.
    const lacksCheckpoint = (card: Card) => card.type !== 'checkpoint' && canRenderCard(card);
    const source = scriptedSource(makeSet(12, [quiz, concept, checkpoint]));
    await renderWithInsets(
      <FeedScreen source={source} renderCard={renderCard} canRenderCard={lacksCheckpoint} />,
    );
    await layout(700);

    expect(screen.getAllByTestId('progress-segment')).toHaveLength(2);
    expect(screen.getByTestId('feed-page-0')).toHaveTextContent(quiz.title, { exact: false });
    expect(screen.getByTestId('feed-page-1', HIDDEN)).toHaveTextContent(concept.title, {
      exact: false,
    });
    expect(screen.getByTestId('feed-page-2', HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId('feed-page-3', HIDDEN)).toBeNull();
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['card_type_skipped', { type: 'checkpoint' }],
    ]);
  });

  it('ends with the Summary card, after the last card', async () => {
    await renderSet([concept, quiz]);

    const summary = screen.getByTestId('feed-page-2', HIDDEN);
    expect(within(summary).getByText('DAY 1 COMPLETE', HIDDEN)).toBeOnTheScreen();
    expect(within(summary).getByText('Keep going', HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId('feed-page-3', HIDDEN)).toBeNull();
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

describe('FeedScreen next, bound to the page that calls it', () => {
  it('a card that answers and calls onNext in one handler moves on, with no toast', async () => {
    await renderSet([quiz, concept], answeringCard(0));

    await pressNext(0);

    expect(shownIndex()).toBe(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a card that answers, then calls onNext from a 550 ms timer, moves on', async () => {
    await renderSet([quiz, concept], answeringCard(550));

    await pressNext(0);
    advance(549);
    expect(shownIndex()).toBe(0);
    advance(1);

    expect(shownIndex()).toBe(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a late onNext from a page the learner left does nothing: no move, no toast', async () => {
    await renderSet([concept, quiz, concept], answeringCard(550));
    await swipe(-80);
    expect(shownIndex()).toBe(1);

    await pressNext(1);
    await swipe(80);
    advance(550);

    expect(shownIndex()).toBe(0);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a late onNext from a card of the set before does nothing in the new set', async () => {
    await renderSet([quiz, concept], answeringCard(550));

    await pressNext(0);
    // A new set starts before the timer fires; its page 0 is answered, so only the round stops it.
    act(() => {
      useFeedStore.getState().startSet({ ...makeSet(12, [concept, concept]), setNumber: 2 });
    });
    await settle();
    advance(550);

    expect(shownIndex()).toBe(0);
    expect(screen.getByText(stubText('concept', 0, true))).toBeOnTheScreen();
  });
});

/**
 * Registers hooks in the calling `describe` that keep React's reports of a boundary catching
 * `Broken`'s error off the console, and fail the test on any other console error or warning.
 */
function expectOnlyBrokenReports() {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    // React reports every error a boundary catches through console.error; keep the run quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    const reports: unknown[][] = consoleError.mock.calls;
    consoleError.mockRestore();
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      expect(report[1]).toBe(cardBroke);
      expect(report[2]).toBe('The above error occurred in the <Broken> component.');
    }
  });
}

describe('FeedScreen card failure', () => {
  expectOnlyBrokenReports();

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
    expect(logError).toHaveBeenCalledWith('render_failed', cardBroke, { boundary: 'card' });
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

/**
 * Renders the feed over `source` with a Summary that always throws, runs `arrive` (for a source
 * whose first set the test delivers), and lays the pager out.
 */
async function renderBrokenSummary(source: CardSource, arrive?: () => Promise<void>) {
  await renderWithInsets(
    <FeedScreen
      source={source}
      renderCard={stubCard}
      canRenderCard={() => true}
      renderSummary={() => <Broken />}
    />,
  );
  await arrive?.();
  await layout(700);
}

/** The failed Summary's one button, on page 1 of a one-card set. */
const failedSummaryButton = () =>
  within(screen.getByTestId('feed-page-1', HIDDEN)).getByRole('button', HIDDEN);

describe('FeedScreen failed Summary', () => {
  expectOnlyBrokenReports();

  it('shows a fallback Summary with Keep going when the Summary fails; the cards still work', async () => {
    await renderBrokenSummary(scriptedSource(makeSet(12, [concept])));

    const page = screen.getByTestId('feed-page-1', HIDDEN);
    const body = within(page).getByTestId('card-frame-body', HIDDEN);
    expect(viewStyleOf(body).backgroundColor).toBe(cardTheme.summary.bg);
    expect(page).toHaveTextContent("DAY 1 COMPLETEThis card couldn't be shown.Keep going", {
      exact: true,
    });
    expect(failedSummaryButton()).toHaveAccessibleName('Keep going');
    expect(failedSummaryButton()).toBeEnabled();
    expect(logError).toHaveBeenCalledWith('render_failed', cardBroke, { boundary: 'summary' });
    await pressNext(0);
    expect(shownIndex()).toBe(1);
  });

  it("the failed Summary's Keep going loads and starts the next set", async () => {
    const next = { ...makeSet(12, [quiz, concept]), setNumber: 2 };
    const source = scriptedSource(makeSet(12, [concept]), next);
    await renderBrokenSummary(source);
    await pressNext(0);

    fireEvent.press(failedSummaryButton());
    await settle();

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(useFeedStore.getState()).toMatchObject({ index: 0, round: 2 });
    expect(useFeedStore.getState().set?.setNumber).toBe(2);
    expect(screen.getByText(stubText('quiz', 0, true))).toBeOnTheScreen();
  });

  it('the failed Summary button is disabled while the next set loads', async () => {
    const source = controlledSource();
    await renderBrokenSummary(source, async () => {
      source.resolve(makeSet(12, [concept]));
      await settle();
    });
    await pressNext(0);

    fireEvent.press(failedSummaryButton());
    await settle();

    expect(failedSummaryButton()).toBeDisabled();
    expect(failedSummaryButton()).toHaveAccessibleName('Keep going');
    fireEvent.press(failedSummaryButton());
    await settle();
    expect(source.getNextSet).toHaveBeenCalledTimes(2);
  });

  it('the failed Summary button reads Retry after a failed load, and retries', async () => {
    const next = { ...makeSet(12, [quiz]), setNumber: 2 };
    const source = scriptedSource(makeSet(12, [concept]), new Error('offline'), next);
    await renderBrokenSummary(source);
    await pressNext(0);

    fireEvent.press(failedSummaryButton());
    await settle();
    expect(failedSummaryButton()).toHaveAccessibleName('Retry');
    expect(failedSummaryButton()).toBeEnabled();

    fireEvent.press(failedSummaryButton());
    await settle();
    expect(useFeedStore.getState().set?.setNumber).toBe(2);
  });

  it('the failed Summary shows no button once the source has no more sets', async () => {
    const source = scriptedSource(makeSet(12, [concept]));
    await renderBrokenSummary(source);
    await pressNext(0);

    fireEvent.press(failedSummaryButton());
    await settle();

    const page = screen.getByTestId('feed-page-1', HIDDEN);
    expect(within(page).queryByRole('button', HIDDEN)).toBeNull();
    expect(page).toHaveTextContent("DAY 1 COMPLETEThis card couldn't be shown.", { exact: true });
  });
});
