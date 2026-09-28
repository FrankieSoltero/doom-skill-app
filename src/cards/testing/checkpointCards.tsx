/**
 * Test support for the checkpoint card: draw it over answers already in the feed store, and read
 * what its rubric and result show. Editing and pressing reuse the exercise card's helpers, which
 * query by role and label only. It lives outside `__tests__/` because Jest runs every file there
 * as a suite.
 */
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { textStyleOf } from '../../components/testing/styles';
import type { CheckpointCard as CheckpointCardData } from '../../data';
import { useInputFocus } from '../../feed/inputFocus';
import { useFeedStore } from '../../feed/store';
import { CheckpointCard } from '../CheckpointCard';
import { demoCard } from './demoCards';
import { INDEX, renderCardWithEditor } from './exerciseCards';
import type { DrawOptions } from './exerciseCards';

/** The grading delay, README.md:137 ("for 1.6s in the demo"). */
export const GRADING_MS = 1600;

/** The iOS announcement mock of React Native's Jest preset. */
export const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

/**
 * The shared setup of the checkpoint card tests: reads the demo card once, and before each test
 * empties the feed and input focus stores and clears the announcement mock. Returns the demo card,
 * once read.
 */
export function setUpCheckpointCardTests(): () => CheckpointCardData {
  let demo: CheckpointCardData | undefined;
  beforeAll(async () => {
    demo = await demoCard('checkpoint');
  });
  beforeEach(() => {
    useFeedStore.setState(useFeedStore.getInitialState(), true);
    useInputFocus.setState(useInputFocus.getInitialState());
    announce.mockClear();
  });
  return () => {
    if (demo === undefined) throw new Error('The demo card is read in beforeAll');
    return demo;
  };
}

/**
 * Puts `answers` in the store and draws `card` at INDEX, active unless asked. Returns the mock
 * `onNext`, a way to change `active` without remounting, and `unmount`.
 */
export function renderCheckpointCard(card: CheckpointCardData, options: DrawOptions = {}) {
  return renderCardWithEditor(
    (active, onNext) => (
      <CheckpointCard card={card} index={INDEX} active={active} onNext={onNext} />
    ),
    options,
  );
}

/** Each rubric row's `checked` state, in order. */
export function checkedRows(): unknown[] {
  return screen.getAllByRole('checkbox').map((row) => {
    const state = (row.props as { accessibilityState?: { checked?: unknown } }).accessibilityState;
    return state?.checked;
  });
}

/** Those of the card's rubric `labels` drawn struck through, in order. */
export function struckLabels(card: CheckpointCardData): string[] {
  return card.rubric
    .map(({ label }) => label)
    .filter((label) => textStyleOf(screen.getByText(label)).textDecorationLine === 'line-through');
}

/** The text of the score line and the feedback, or an empty list before a grade. */
export function resultTexts(): string[] {
  return screen.queryAllByTestId(/^checkpoint-(score|feedback)$/).map((text) => {
    const { children } = text.props as { children?: unknown };
    return String(children);
  });
}
