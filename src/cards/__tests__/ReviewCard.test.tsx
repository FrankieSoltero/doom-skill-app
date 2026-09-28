import { act, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { ReviewCard as ReviewCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { border, cardTheme, colors, fonts, type } from '../../theme';
import { answerAt } from '../testing/choiceCards';
import { demoCard } from '../testing/demoCards';
import {
  advance,
  rate,
  REVEAL,
  reveal,
  revealButton,
  renderReviewCard,
} from '../testing/reviewCards';

// Reanimated's reduce-motion hook, replaced so a test can turn the system setting on.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual<object>('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

/** The page the card sits on in these tests: not 0, so an index mix-up shows. */
const INDEX = 3;
const HIDDEN = { includeHiddenElements: true };
const accessibility = jest.mocked(AccessibilityInfo);

let demo: ReviewCardData;

beforeAll(async () => {
  demo = await demoCard('review');
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  accessibility.announceForAccessibility.mockClear();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

/** Draws `card` at INDEX over `answers`. */
function renderCard(card: ReviewCardData, answers: Record<number, CardAnswer> = {}) {
  return renderReviewCard(card, INDEX, answers);
}

describe('ReviewCard before reveal', () => {
  it('shows the kicker, estimate and prompt of the demo card, README.md:115', () => {
    renderCard(demo);

    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.review.bg,
    );
    for (const text of ['Review · Seen 3 days ago', '~20 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
    const title = screen.getByRole('header', { name: 'What does ~ mean in mini-notation?' });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleL, color: colors.ink });
  });

  it('says a card seen yesterday was seen 1 day ago', () => {
    renderCard({ ...demo, lastSeenDays: 1 });

    expect(screen.getByText('Review · Seen 1 day ago')).toBeOnTheScreen();
  });

  it('draws a 130 tall dashed reveal button with an eye icon, README.md:116', () => {
    renderCard(demo);

    // Dashed borders draw only with one width and one color on all four sides: no side keys.
    expect(viewStyleOf(revealButton())).toStrictEqual({
      height: 130,
      borderWidth: border.strong,
      borderColor: colors.ink,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    });
    expect(textStyleOf(within(revealButton()).getByText(REVEAL))).toStrictEqual({
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 25,
      color: colors.ink,
    });
    const icon = within(revealButton()).getByTestId('reveal-icon', HIDDEN);
    expect(icon.props).toMatchObject({ width: 22, height: 22, stroke: colors.ink });
    expect(icon.props).toMatchObject({ strokeWidth: 1.5, accessibilityElementsHidden: true });
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('hides the answer, the code and the ratings, and leaves the store empty', () => {
    renderCard(demo);

    expect(screen.queryByTestId('review-answer')).toBeNull();
    expect(screen.queryByTestId('code-block')).toBeNull();
    expect(screen.queryByTestId('rating-row')).toBeNull();
    expect(answerAt(INDEX)).toBeUndefined();
  });
});

describe('ReviewCard reveal', () => {
  it('shows the answer, the code, the spacer, then the caption and four ratings', () => {
    renderCard(demo);

    reveal();

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'review', revealed: true, rating: null });
    expect(screen.queryByRole('button', { name: REVEAL })).toBeNull();
    const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(
      /^(review-answer-text|code-block|review-spacer|rating-row)$/,
    );
    expect(parts.map((part) => part.props.testID as unknown)).toStrictEqual([
      'review-answer-text',
      'code-block',
      'review-spacer',
      'rating-row',
    ]);
    expect(screen.getByTestId('review-answer-text')).toHaveTextContent(demo.answer);
    expect(screen.getByTestId('code-block-code')).toHaveTextContent('s("bd ~ sd ~")');
    expect(screen.getByText('How well did you remember?')).toBeOnTheScreen();
    const ratings = within(screen.getByTestId('rating-buttons')).getAllByRole('button');
    expect(ratings.map((button) => String(button.props.accessibilityLabel))).toStrictEqual([
      'Again, next review in <1 min',
      'Hard, next review in 2 days',
      'Good, next review in 4 days',
      'Easy, next review in 9 days',
    ]);
    expect(viewStyleOf(screen.getByTestId('review-spacer'))).toStrictEqual({ flex: 1 });
    expect(viewStyleOf(screen.getByTestId('review-answer'))).toStrictEqual({ gap: 10 });
  });

  it('sets the answer at 17 points with its bold marking, README.md:118', () => {
    renderCard({ ...demo, answer: 'A **rest**. It keeps a step silent.' });

    reveal();

    const answer = within(screen.getByTestId('review-answer-text')).getByText(/^A /);
    expect(textStyleOf(answer)).toStrictEqual({
      ...type.body,
      fontSize: 17,
      lineHeight: 26,
      color: colors.ink,
    });
    expect(screen.getByTestId('bold-span')).toHaveTextContent('rest');
  });

  it('announces the answer without its bold markers, in a polite live region', () => {
    renderCard({ ...demo, answer: 'A **rest**. Silent.' });

    reveal();

    expect(accessibility.announceForAccessibility.mock.calls).toStrictEqual([['A rest. Silent.']]);
    expect(screen.getByTestId('review-answer-text').props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows an answer already revealed, without announcing it', () => {
    renderCard(demo, { [INDEX]: { kind: 'review', revealed: true, rating: null } });

    expect(screen.getByTestId('review-answer-text')).toHaveTextContent(demo.answer);
    expect(screen.getByRole('button', { name: 'Good, next review in 4 days' })).toBeEnabled();
    expect(accessibility.announceForAccessibility).not.toHaveBeenCalled();
  });
});

describe('ReviewCard rating', () => {
  it('stores the rating by position; Good turns ink with yellow text', () => {
    renderCard(demo);
    reveal();

    rate('Good');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'review', revealed: true, rating: 2 });
    const good = screen.getByRole('button', { name: 'Good, next review in 4 days' });
    expect(viewStyleOf(within(good).getByTestId('rating-face')).backgroundColor).toBe(colors.ink);
    expect(textStyleOf(within(good).getByText('Good')).color).toBe(cardTheme.review.bg);
  });

  it('rates once: a second tap, before or after the card re-renders, changes nothing', () => {
    jest.useFakeTimers();
    const { onNext } = renderCard(demo);
    reveal();

    // One act around the first two taps: the card does not re-render between them, so its
    // buttons are still enabled for the second. The third comes after the re-render.
    act(() => {
      rate('Hard');
      rate('Easy');
    });
    const answers = useFeedStore.getState().answers;
    rate('Good');
    advance(2000);

    expect(useFeedStore.getState().answers).toBe(answers);
    expect(answerAt(INDEX)).toStrictEqual({ kind: 'review', revealed: true, rating: 1 });
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewCard auto-advance', () => {
  it('calls onNext once, 550 ms after the rating, README.md:121', () => {
    jest.useFakeTimers();
    const { onNext } = renderCard(demo);
    reveal();

    rate('Again');
    advance(549);
    expect(onNext).not.toHaveBeenCalled();
    advance(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('still moves on with reduce motion set: the advance is not decoration', () => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { onNext } = renderCard(demo);
    reveal();

    rate('Easy');
    advance(550);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clears its timer when removed before 550 ms; onNext is never called', () => {
    jest.useFakeTimers();
    const { onNext } = renderCard(demo);
    reveal();
    const before = jest.getTimerCount();

    rate('Good');
    expect(jest.getTimerCount()).toBe(before + 1);
    advance(300);
    screen.unmount();

    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    advance(1000);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('starts no timer for a rating already stored, and shows it rated', () => {
    jest.useFakeTimers();
    const before = jest.getTimerCount();
    const { onNext } = renderCard(demo, { [INDEX]: { kind: 'review', revealed: true, rating: 1 } });

    expect(jest.getTimerCount()).toBe(before);
    advance(1000);
    expect(onNext).not.toHaveBeenCalled();
    const hard = screen.getByRole('button', { name: 'Hard, next review in 2 days' });
    expect(hard).toBeDisabled();
    expect(viewStyleOf(within(hard).getByTestId('rating-face')).backgroundColor).toBe(colors.ink);
  });
});

describe('ReviewCard and the store', () => {
  it('ignores an answer at another index, and an answer of another kind at its own', () => {
    renderCard(demo, {
      [INDEX]: { kind: 'choice', picked: 0 },
      [INDEX + 1]: { kind: 'review', revealed: true, rating: 2 },
    });

    expect(revealButton()).toBeOnTheScreen();
    expect(screen.queryByTestId('rating-row')).toBeNull();
  });

  it("does not re-render when another card's answer changes", () => {
    const { onRender } = renderCard(demo);
    const commits = onRender.mock.calls.length;

    act(() => {
      useFeedStore.getState().setAnswer(INDEX + 1, { kind: 'choice', picked: 1 });
    });

    expect(onRender).toHaveBeenCalledTimes(commits);
  });

  it('shows the card unrevealed again once a new set starts', () => {
    renderCard(demo, { [INDEX]: { kind: 'review', revealed: true, rating: 3 } });

    act(() => {
      useFeedStore.getState().startSet(makeSet(1, [cardsByType.review]));
    });

    expect(revealButton()).toBeOnTheScreen();
    expect(screen.queryByTestId('rating-row')).toBeNull();
  });
});
