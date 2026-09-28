import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, fonts, type } from '../../theme';
import { ChoiceCard } from '../ChoiceCard';
import {
  answerAt,
  nextCardButton,
  nextCardDisabled,
  optionNames,
  pickOption,
  renderChoiceCard,
} from '../testing/choiceCards';

/** The page the card sits on in these tests: not 0, so an index mix-up shows. */
const INDEX = 4;
const CHILD = 'Between the title and the options';

// One case per card type ChoiceCard draws, with what its kicker row shows and its options.
const QUIZ = {
  card: cardsByType.quiz,
  kicker: 'Quiz · mini-notation',
  meta: '~20 s',
  right: 'Two',
  wrong: 'Four',
};
const PREDICT = {
  card: cardsByType.predict,
  kicker: 'Predict · mini-notation',
  meta: '~25 s',
  right: 'Two kicks',
  wrong: 'One kick',
};

type Case = typeof QUIZ | typeof PREDICT;
type Shape = { layout?: 'stack' | 'grid'; mono?: boolean; children?: ReactNode };

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the case's card at INDEX, stacked in the code font unless `shape` says otherwise. */
function renderCase({ card }: Case, shape: Shape = {}, answers: Record<number, CardAnswer> = {}) {
  const { layout = 'stack', mono = true, children } = shape;
  return renderChoiceCard(
    (onNext) => (
      <ChoiceCard card={card} index={INDEX} onNext={onNext} layout={layout} mono={mono}>
        {children}
      </ChoiceCard>
    ),
    answers,
  );
}

/** Every text in the card, in tree order. */
function texts(): string[] {
  return within(screen.getByTestId('card-frame-body'))
    .getAllByText(/./)
    .map((text) => String(text.props.children));
}

describe.each<Case>([QUIZ, PREDICT])('ChoiceCard, $card.type card', (item) => {
  it("takes the frame, kicker, meta and title from the card, in its type's colors", () => {
    renderCase(item);

    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme[item.card.type].bg,
    );
    for (const text of [item.kicker, item.meta]) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
    const title = screen.getByRole('header', { name: item.card.title });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleM, color: colors.ink });
  });

  it('draws its children between the title and the options, then the spacer and button', () => {
    renderCase(item, { children: <Text>{CHILD}</Text> });

    expect(texts()).toStrictEqual([
      item.kicker,
      item.meta,
      item.card.title,
      CHILD,
      ...item.card.options,
      'Next card',
    ]);
    const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(
      /^(choice-options|\w+-spacer|primary-button-face)$/,
    );
    expect(parts.map((part) => part.props.testID as unknown)).toStrictEqual([
      'choice-options',
      `${item.card.type}-spacer`,
      'primary-button-face',
    ]);
    expect(viewStyleOf(screen.getByTestId(`${item.card.type}-spacer`))).toStrictEqual({ flex: 1 });
  });

  it('draws nothing between the title and the options without children', () => {
    renderCase(item);

    expect(texts().slice(2, 4)).toStrictEqual([item.card.title, item.card.options[0]]);
  });

  it('colors the right option with the card type color once picked', () => {
    renderCase(item);

    pickOption(item.right);

    expect(textStyleOf(screen.getByText(item.right)).color).toBe(cardTheme[item.card.type].bg);
  });

  it('stores the pick at its index, and locks after the first pick', () => {
    renderCase(item);

    pickOption(item.wrong);
    const answers = useFeedStore.getState().answers;
    pickOption(item.right);

    expect(answers).toStrictEqual({
      [INDEX]: { kind: 'choice', picked: item.card.options.indexOf(item.wrong) },
    });
    expect(useFeedStore.getState().answers).toBe(answers);
  });

  it('keeps the first of two picks made before it re-renders', () => {
    renderCase(item);

    // One act around both picks: the card does not re-render between them, so its options are
    // still unlocked for the second.
    act(() => {
      pickOption(item.wrong);
      pickOption(item.right);
    });

    expect(answerAt(INDEX)).toStrictEqual({
      kind: 'choice',
      picked: item.card.options.indexOf(item.wrong),
    });
  });

  it('keeps Next card disabled until a pick, then calls onNext once per press', () => {
    const onNext = renderCase(item);

    expect(nextCardDisabled()).toBe(true);
    fireEvent.press(nextCardButton());
    expect(onNext).not.toHaveBeenCalled();

    pickOption(item.right);
    expect(nextCardDisabled()).toBe(false);
    fireEvent.press(nextCardButton());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('shows an answer already stored at its index', () => {
    renderCase(item, {}, { [INDEX]: { kind: 'choice', picked: item.card.correct } });

    expect(optionNames()[item.card.correct]).toMatch(/\. Correct answer\.$/);
    expect(screen.getByTestId('choice-explanation')).toBeOnTheScreen();
    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: item.card.correct });
    expect(nextCardDisabled()).toBe(false);
  });
});

describe('ChoiceCard layout and font', () => {
  it.each([
    { layout: 'stack' as const, mono: true, rows: 0, fontFamily: fonts.mono },
    { layout: 'grid' as const, mono: false, rows: 1, fontFamily: fonts.body },
  ])('$layout, mono $mono: $rows grid rows, labels in $fontFamily', (shape) => {
    renderCase(QUIZ, shape);

    expect(screen.queryAllByTestId('choice-row')).toHaveLength(shape.rows);
    expect(textStyleOf(screen.getByText('Two')).fontFamily).toBe(shape.fontFamily);
  });
});
