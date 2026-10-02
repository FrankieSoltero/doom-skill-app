/**
 * Test support for the cards built on `ChoiceCard` (quiz, predict, cloze and scenario): draw a
 * card over answers already in the feed store, then read what a learner sees and what the store
 * holds. It lives outside `__tests__/` because Jest runs every file there as a suite. Reset the
 * store in `beforeEach` with `useFeedStore.setState(useFeedStore.getInitialState(), true)`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { Card } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import type { Attempt } from '../../feed/outbox';
import { sendAttemptsTo, useFeedStore } from '../../feed/store';
import { makeSet } from '../../feed/testing/sets';

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

/**
 * The responses the store sends to the attempt outbox when a learner picks `label` on `card`,
 * served by the API (with an id, in a dated set) and drawn by `draw` at page 0.
 */
export function responsesAfterPick(
  card: Card,
  draw: (onNext: () => void) => ReactElement,
  label: string,
): Attempt['response'][] {
  const add = jest.fn<undefined, [Attempt]>();
  sendAttemptsTo({ add });
  const served = { ...card, id: '00000000-0000-4000-8000-000000000001' };
  useFeedStore.getState().startSet({ ...makeSet(0, [served]), feedDate: '2026-10-02' });
  try {
    render(draw(jest.fn()));
    pickOption(label);
    return add.mock.calls.map(([attempt]) => attempt.response);
  } finally {
    sendAttemptsTo(null);
  }
}

/** The test IDs `pattern` matches inside the card's frame, in tree order. */
export function partsInOrder(pattern: RegExp): unknown[] {
  const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(pattern);
  return parts.map((part) => part.props.testID as unknown);
}

/** The option cells in each row of a grid layout; empty for a stack. */
export function gridCells(): number[] {
  const rows = screen.queryAllByTestId('choice-row');
  return rows.map((row) => within(row).getAllByTestId('choice-cell').length);
}
