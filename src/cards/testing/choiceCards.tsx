/**
 * Test support for the cards built on `ChoiceCard` (quiz and predict): draw a card over answers
 * already in the feed store, then read what a learner sees and what the store holds. It lives
 * outside `__tests__/` because Jest runs every file there as a suite. Reset the store in
 * `beforeEach` with `useFeedStore.setState(useFeedStore.getInitialState(), true)`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';

/**
 * Puts `answers` in the store, then draws the element `draw` builds around a mock `onNext`.
 * Returns that mock.
 */
export function renderChoiceCard(
  draw: (onNext: () => void) => ReactElement,
  answers: Record<number, CardAnswer> = {},
) {
  useFeedStore.setState({ answers });
  const onNext = jest.fn<undefined, []>();
  render(draw(onNext));
  return onNext;
}

/** The card's Next card button. */
export function nextCardButton() {
  return screen.getByRole('button', { name: 'Next card' });
}

/**
 * Whether Next card says it is disabled. `Pressable` fills `disabled` from its own prop too (see
 * docs/mistakes-and-fixes.md), so pair this with a press that checks `onNext`.
 */
export function nextCardDisabled(): unknown {
  const { disabled } = nextCardButton().props.accessibilityState as { disabled?: boolean };
  return disabled;
}

/** Each option's spoken label, in order: the label, then its verdict once answered. */
export function optionNames(): string[] {
  const options = within(screen.getByTestId('choice-options')).getAllByRole('button');
  return options.map((option) => String(option.props.accessibilityLabel));
}

/** Presses the option whose label is `label`. */
export function pickOption(label: string): void {
  fireEvent.press(screen.getByText(label));
}

/** The answer the store holds at `index`. */
export function answerAt(index: number): CardAnswer | undefined {
  return useFeedStore.getState().answers[index];
}
