import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Profiler } from 'react';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { QuizCard as QuizCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, fonts, type } from '../../theme';
import { ChoiceBody } from '../ChoiceBody';
import { QuizCard } from '../QuizCard';
import { demoCard } from '../testing/demoCards';

/** The page this card sits on in the tests: not 0, so an index mix-up shows. */
const INDEX = 2;
const OPTIONS = ['s("bd/4")', 's("bd*4")', 's("bd ~ bd ~")', 's("<bd bd>")'];

// The demo quiz card, read once through the data boundary (rule SS-6).
let demo: QuizCardData = cardsByType.quiz;

beforeAll(async () => {
  demo = await demoCard('quiz');
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Renders the demo card at INDEX, after storing `answers`, inside a Profiler that counts commits. */
function renderQuiz(answers: Record<number, CardAnswer> = {}) {
  useFeedStore.setState({ answers });
  const onNext = jest.fn<undefined, []>();
  const onRender = jest.fn();
  render(
    <Profiler id="quiz" onRender={onRender}>
      <QuizCard card={demo} index={INDEX} onNext={onNext} />
    </Profiler>,
  );
  return { onNext, onRender };
}

const nextButton = () => screen.getByRole('button', { name: 'Next card' });
const stored = () => useFeedStore.getState().answers[INDEX];

/** What a screen reader says for each option, in order. */
function spokenOptions(): string[] {
  return within(screen.getByTestId('choice-options'))
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel));
}

/** Presses the option showing `label`; the press reaches its button. */
function pick(label: string): void {
  fireEvent.press(screen.getByText(label));
}

function isDisabled(button: ReturnType<typeof nextButton>): unknown {
  const state = button.props.accessibilityState as { disabled?: boolean };
  return state.disabled;
}

describe('QuizCard content, from the demo card (README.md:59-65)', () => {
  it('shows the kicker and estimate in the kicker style, on the quiz color', () => {
    renderQuiz();

    for (const text of ['Quiz · Speed', '~30 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.quiz.bg,
    );
  });

  it('shows the title as a medium card title and a header', () => {
    renderQuiz();
    const title = screen.getByRole('header', {
      name: 'Which pattern plays four kicks in every cycle?',
    });

    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleM, color: colors.ink });
  });

  it('shows the four options stacked, in the code font', () => {
    renderQuiz();

    expect(screen.queryAllByTestId('choice-row')).toHaveLength(0);
    expect(spokenOptions()).toStrictEqual(OPTIONS);
    for (const label of OPTIONS) {
      expect(textStyleOf(screen.getByText(label))).toMatchObject({
        fontFamily: fonts.mono,
        fontSize: 15,
      });
    }
  });

  it('lays out kicker, title, options, explanation, a flex spacer, then the ink button', () => {
    renderQuiz({ [INDEX]: { kind: 'choice', picked: 1 } });
    // Queries return elements in tree order.
    const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(
      /^(card-kicker-row|choice-options|choice-explanation|quiz-spacer|primary-button-face)$/,
    );

    expect(parts.map((part) => part.props.testID as unknown)).toStrictEqual([
      'card-kicker-row',
      'choice-options',
      'choice-explanation',
      'quiz-spacer',
      'primary-button-face',
    ]);
    expect(viewStyleOf(screen.getByTestId('quiz-spacer'))).toStrictEqual({ flex: 1 });
    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(colors.ink);
  });
});

describe('QuizCard before an answer', () => {
  it('shows no explanation, and Next card is disabled and does nothing', () => {
    const { onNext } = renderQuiz();

    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(isDisabled(nextButton())).toBe(true);
    fireEvent.press(nextButton());
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('QuizCard picking', () => {
  it('stores the right pick at its index, marks it correct and explains, led by Correct.', () => {
    renderQuiz();

    pick('s("bd*4")');

    expect(useFeedStore.getState().answers).toStrictEqual({
      [INDEX]: { kind: 'choice', picked: 1 },
    });
    expect(spokenOptions()[1]).toBe('s("bd*4"). Correct answer.');
    expect(textStyleOf(screen.getByText('s("bd*4")')).color).toBe(cardTheme.quiz.bg);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Correct\. \*4 repeats/);
  });

  it('after a wrong pick, explains led by Not quite. and shows the correct option', () => {
    renderQuiz();

    pick('s("bd/4")');

    expect(stored()).toStrictEqual({ kind: 'choice', picked: 0 });
    expect(spokenOptions()).toStrictEqual([
      's("bd/4"). Not correct.',
      's("bd*4"). Correct answer.',
      's("bd ~ bd ~")',
      's("<bd bd>")',
    ]);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Not quite\. \*4 repeats/);
  });

  it('enables Next card once answered; pressing it calls onNext once', () => {
    const { onNext } = renderQuiz();
    pick('s("<bd bd>")');

    expect(isDisabled(nextButton())).toBe(false);
    fireEvent.press(nextButton());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('locks after the first pick: another tap changes nothing in the store', () => {
    renderQuiz();
    pick('s("bd*4")');
    const answers = useFeedStore.getState().answers;

    pick('s("bd/4")');
    // The card ignores a pick even if an option still reported one.
    const { onPick } = screen.UNSAFE_getByType(ChoiceBody).props as {
      onPick: (index: number) => void;
    };
    act(() => {
      onPick(3);
    });

    expect(useFeedStore.getState().answers).toBe(answers);
    expect(stored()).toStrictEqual({ kind: 'choice', picked: 1 });
  });
});

describe('QuizCard and the store', () => {
  it('shows the answered state for an answer already stored at its index', () => {
    renderQuiz({ [INDEX]: { kind: 'choice', picked: 3 } });

    expect(spokenOptions()[3]).toBe('s("<bd bd>"). Not correct.');
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Not quite\./);
    expect(isDisabled(nextButton())).toBe(false);
  });

  it('ignores an answer stored at another index', () => {
    renderQuiz({ [INDEX + 1]: { kind: 'choice', picked: 1 } });

    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(isDisabled(nextButton())).toBe(true);
  });

  it('treats an answer of another kind at its index as no answer', () => {
    renderQuiz({ [INDEX]: { kind: 'review', revealed: true, rating: 2 } });

    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(isDisabled(nextButton())).toBe(true);
    pick('s("bd*4")');
    expect(stored()).toStrictEqual({ kind: 'choice', picked: 1 });
  });

  it("does not re-render when another card's answer changes", () => {
    const { onRender } = renderQuiz();
    const commits = onRender.mock.calls.length;

    act(() => {
      useFeedStore.getState().setAnswer(INDEX + 1, { kind: 'choice', picked: 0 });
    });

    expect(onRender).toHaveBeenCalledTimes(commits);
  });
});
