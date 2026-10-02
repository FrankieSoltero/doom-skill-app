import { fireEvent, screen } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, fonts, type } from '../../theme';
import { ClozeCard } from '../ClozeCard';
import {
  answerAt,
  gridCells,
  nextCardButton,
  nextCardDisabled,
  optionNames,
  partsInOrder,
  pickOption,
  renderChoiceCard,
  responsesAfterPick,
} from '../testing/choiceCards';

/** The page this card sits on in the tests: not 0, so an index mix-up shows. */
const INDEX = 4;
const { cloze } = cardsByType;

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the cloze card at INDEX after storing `answers`. */
function renderCloze(answers: Record<number, CardAnswer> = {}) {
  return renderChoiceCard(
    (onNext) => <ClozeCard card={cloze} index={INDEX} onNext={onNext} />,
    answers,
  );
}

describe('ClozeCard content', () => {
  it('shows the kicker Fill in and its node, the estimate, the quiz color and a medium title', () => {
    renderCloze();

    for (const text of ['Fill in · photosynthesis', '~30 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.quiz.bg,
    );
    const title = screen.getByRole('header', { name: 'Fill in the blank' });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleM, color: colors.ink });
  });

  it('shows the sentence, blank and all, in a passage block', () => {
    renderCloze();

    expect(screen.getByTestId('passage-text')).toHaveTextContent(
      'Photosynthesis turns light energy into ___ energy stored in sugar.',
      { exact: true },
    );
  });

  it('lays out kicker, passage, options, explanation, a flex spacer, then the button', () => {
    renderCloze({ [INDEX]: { kind: 'choice', picked: 0 } });

    expect(
      partsInOrder(
        /^(card-kicker-row|passage|choice-options|choice-explanation|cloze-spacer|primary-button-face)$/,
      ),
    ).toStrictEqual([
      'card-kicker-row',
      'passage',
      'choice-options',
      'choice-explanation',
      'cloze-spacer',
      'primary-button-face',
    ]);
  });

  it('shows the four options in two columns of cells, in the body font, centered', () => {
    renderCloze();

    expect(optionNames()).toStrictEqual(cloze.options);
    expect(gridCells()).toStrictEqual([2, 2]);
    for (const label of cloze.options) {
      expect(textStyleOf(screen.getByText(label))).toMatchObject({
        ...type.body,
        fontFamily: fonts.body,
        textAlign: 'center',
      });
    }
  });
});

describe('ClozeCard picking, as a quiz', () => {
  it('shows no explanation before a pick, and Next card is disabled', () => {
    const onNext = renderCloze();

    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(nextCardDisabled()).toBe(true);
    fireEvent.press(nextCardButton());
    expect(onNext).not.toHaveBeenCalled();
  });

  it('after the right pick: stores it, colors the option coral, and explains led by Correct.', () => {
    renderCloze();

    pickOption('chemical');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 0 });
    expect(textStyleOf(screen.getByText('chemical')).color).toBe(colors.coral);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(
      'Correct. The plant stores it in the chemical bonds of glucose.',
    );
    expect(nextCardDisabled()).toBe(false);
  });

  it('after a wrong pick: that option wrong, the right one shown, Not quite., and locked', () => {
    renderCloze();

    pickOption('nuclear');
    pickOption('chemical');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 2 });
    expect(optionNames()).toStrictEqual([
      'chemical. Correct answer.',
      'thermal',
      'nuclear. Not correct.',
      'kinetic',
    ]);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Not quite\. The plant/);
  });

  it('sends the pick to the outbox as a choice', () => {
    const responses = responsesAfterPick(
      cloze,
      (onNext) => <ClozeCard card={cloze} index={0} onNext={onNext} />,
      'thermal',
    );

    expect(responses).toStrictEqual([{ choice: 1 }]);
  });
});
