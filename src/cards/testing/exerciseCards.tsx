/**
 * Test support for the exercise card: draw it over answers already in the feed store, then edit,
 * check and play as a learner would, and read what the card shows and passes to its grid. It lives
 * outside `__tests__/` because Jest runs every file there as a suite. Reset the feed store and the
 * input focus store in `beforeEach`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { BeatGrid } from '../../components/BeatGrid';
import type { Element } from '../../components/testing/styles';
import type { ExerciseCard as ExerciseCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import type { GridRow } from '../../feed/exercise';
import { useInputFocus } from '../../feed/inputFocus';
import { useFeedStore } from '../../feed/store';
import { useStrudel } from '../../strudel/useStrudel';
import { ExerciseCard } from '../ExerciseCard';
import { demoCard } from './demoCards';
import { resetStrudelDouble, useStrudelDouble } from './strudelDouble';

/** The text of the demo card's two check badges, as `badges` reads them. */
export const PASS = 'Spec met: The hi-hat now plays eight times per cycle.';
export const FAIL = 'Not yet: Change how many times hh repeats inside the cycle.';

/**
 * The shared setup of the exercise card tests: reads the demo card once, and before each test
 * empties the feed and input focus stores and points the mocked `useStrudel` at a fresh double
 * (see ./strudelDouble.tsx; the test file mocks the hook). Returns the demo card, once read.
 */
export function setUpExerciseCardTests(): () => ExerciseCardData {
  let demo: ExerciseCardData | undefined;
  beforeAll(async () => {
    demo = await demoCard('exercise');
  });
  beforeEach(() => {
    useFeedStore.setState(useFeedStore.getInitialState(), true);
    useInputFocus.setState(useInputFocus.getInitialState());
    resetStrudelDouble();
    jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
  });
  return () => {
    if (demo === undefined) throw new Error('The demo card is read in beforeAll');
    return demo;
  };
}

/** The page the card sits on in these tests: not 0, so an index mix-up shows. */
export const INDEX = 2;

type DrawOptions = { active?: boolean; answers?: Record<number, CardAnswer> };

/**
 * Puts `answers` in the store and draws `card` at INDEX, active unless asked. Returns the mock
 * `onNext`, a way to change `active` without remounting, and `unmount`.
 */
export function renderExerciseCard(card: ExerciseCardData, options: DrawOptions = {}) {
  const { active = true, answers = {} } = options;
  useFeedStore.setState({ answers });
  const onNext = jest.fn<undefined, []>();
  const draw = (isActive: boolean) => (
    <ExerciseCard card={card} index={INDEX} active={isActive} onNext={onNext} />
  );
  const view = render(draw(active));
  const setActive = (next: boolean) => {
    view.rerender(draw(next));
  };
  return { onNext, setActive, unmount: view.unmount };
}

/** The card's code editor. */
export const editor = () => screen.getByLabelText('Code editor');

/** Replaces the editor's text with `code`, as typing does. */
export function typeCode(code: string): void {
  fireEvent.changeText(editor(), code);
}

/** The button named `name`. */
export const button = (name: string) => screen.getByRole('button', { name });

/** Presses the button named `name`. */
export function press(name: string): void {
  fireEvent.press(button(name));
}

/** Whether the button named `name` reports itself disabled. */
export function isDisabled(name: string): unknown {
  return (button(name).props.accessibilityState as { disabled?: boolean }).disabled;
}

/** The answer the store holds at INDEX. */
export function storedAnswer(): CardAnswer | undefined {
  return useFeedStore.getState().answers[INDEX];
}

/** How many feed inputs have focus. */
export function focusedInputs(): number {
  return useInputFocus.getState().focusedIds.size;
}

/** What the card passes to its beat grid. */
export function gridProps(): { rows: GridRow[]; step: number | null } {
  return screen.UNSAFE_getByType(BeatGrid).props as { rows: GridRow[]; step: number | null };
}

/** The text inside `element`, joined in order. */
function textOf(element: Element): string {
  return element.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

/** Each result or notice badge as `label: message`, in order; `label` alone with no message. */
export function badges(): string[] {
  return screen.queryAllByTestId('result-badge').map((badge) => {
    const label = textOf(within(badge).getByTestId('result-badge-label'));
    const message = within(badge).queryByTestId('result-badge-message');
    return message === null ? label : `${label}: ${textOf(message)}`;
  });
}
