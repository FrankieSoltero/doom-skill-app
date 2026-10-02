import { screen } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, fonts } from '../../theme';
import { NumericCard } from '../NumericCard';
import {
  answerAt,
  gridCells,
  nextCardDisabled,
  optionNames,
  partsInOrder,
  pickOption,
  renderChoiceCard,
  responsesAfterPick,
} from '../testing/choiceCards';

/** The page this card sits on in the tests: not 0, so an index mix-up shows. */
const INDEX = 2;
const { numeric } = cardsByType;

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the numeric card at INDEX, with nothing answered. */
function renderNumeric() {
  return renderChoiceCard((onNext) => <NumericCard card={numeric} index={INDEX} onNext={onNext} />);
}

/** The texts drawn among `wanted`, in tree order. */
function textsInOrder(wanted: readonly string[]): unknown[] {
  const texts = screen.getAllByText(/./).map((node) => node.props.children as unknown);
  return texts.filter((text) => typeof text === 'string' && wanted.includes(text));
}

describe('NumericCard content', () => {
  it('shows the kicker Work it out and its node, on the quiz color', () => {
    renderNumeric();

    expect(textStyleOf(screen.getByText('Work it out · unit conversion'))).toMatchObject({
      textTransform: 'uppercase',
    });
    expect(screen.getByText('~60 s')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.quiz.bg,
    );
    expect(screen.getByRole('header', { name: 'How fast in m/s?' })).toBeOnTheScreen();
  });

  it('draws the title, then the problem in a passage block, then the options', () => {
    renderNumeric();

    expect(screen.getByTestId('passage-text')).toHaveTextContent(numeric.problem, { exact: true });
    expect(textsInOrder([numeric.title, numeric.problem, ...numeric.options])).toStrictEqual([
      numeric.title,
      numeric.problem,
      ...numeric.options,
    ]);
    expect(partsInOrder(/^(card-kicker-row|passage|choice-options|numeric-spacer)$/)).toEqual([
      'card-kicker-row',
      'passage',
      'choice-options',
      'numeric-spacer',
    ]);
  });

  it('shows its options as a grid of two rows of two, in the body font', () => {
    renderNumeric();

    expect(gridCells()).toStrictEqual([2, 2]);
    expect(optionNames()).toStrictEqual(numeric.options);
    numeric.options.forEach((label) => {
      expect(textStyleOf(screen.getByText(label)).fontFamily).toBe(fonts.body);
    });
  });
});

describe('NumericCard picking, as a quiz', () => {
  it('after the right pick: Correct., then the explanation with the answer in bold', () => {
    renderNumeric();
    expect(nextCardDisabled()).toBe(true);

    pickOption('15 m/s');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 0 });
    expect(textStyleOf(screen.getByText('15 m/s')).color).toBe(colors.coral);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(
      'Correct. Divide by 3.6: 54 / 3.6 = 15',
      { exact: true },
    );
    const bold = screen.getAllByTestId('bold-span');
    expect(bold.map((span) => span.props.children as unknown)).toStrictEqual(['Correct.', '15']);
    expect(bold[1] && textStyleOf(bold[1]).fontFamily).toBe(fonts.bodyBold);
    expect(nextCardDisabled()).toBe(false);
  });

  it('after a wrong pick: Not quite., that option wrong, the right one shown, and locked', () => {
    renderNumeric();

    pickOption('150 m/s');
    pickOption('15 m/s');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 1 });
    expect(optionNames()).toStrictEqual([
      '15 m/s. Correct answer.',
      '150 m/s. Not correct.',
      '19.4 m/s',
      '1.5 m/s',
    ]);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(
      'Not quite. Divide by 3.6: 54 / 3.6 = 15',
      { exact: true },
    );
  });

  it('sends the pick to the outbox as a choice', () => {
    const draw = (onNext: () => void) => <NumericCard card={numeric} index={0} onNext={onNext} />;

    expect(responsesAfterPick(numeric, draw, '19.4 m/s')).toStrictEqual([{ choice: 2 }]);
  });
});
