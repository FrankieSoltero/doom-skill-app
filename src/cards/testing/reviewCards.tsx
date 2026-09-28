/**
 * Test support for the review card: draw it over answers already in the feed store, then reveal
 * and rate as a learner would. It lives outside `__tests__/` because Jest runs every file there
 * as a suite. Reset the store in `beforeEach` with
 * `useFeedStore.setState(useFeedStore.getInitialState(), true)`.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Profiler } from 'react';

import type { ReviewCard as ReviewCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import { ReviewCard } from '../ReviewCard';
import { renderChoiceCard } from './choiceCards';

/** The reveal button's label, README.md:116. */
export const REVEAL = 'Recall it, then tap to reveal';

/**
 * Puts `answers` in the store and draws `card` at `index` inside a `Profiler`, so a test can
 * count the card's commits. Returns the mock `onNext` and the profiler's `onRender`.
 */
export function renderReviewCard(
  card: ReviewCardData,
  index: number,
  answers: Record<number, CardAnswer> = {},
) {
  const onRender = jest.fn();
  const onNext = renderChoiceCard(
    (next) => (
      <Profiler id="review" onRender={onRender}>
        <ReviewCard card={card} index={index} onNext={next} />
      </Profiler>
    ),
    answers,
  );
  return { onNext, onRender };
}

/** The reveal button. */
export function revealButton() {
  return screen.getByRole('button', { name: REVEAL });
}

/** Presses the reveal button. */
export function reveal(): void {
  fireEvent.press(revealButton());
}

/** Presses the rating whose label is `label`. */
export function rate(label: string): void {
  fireEvent.press(screen.getByText(label));
}

/** Moves fake time on by `ms`, inside `act`. */
export function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}
