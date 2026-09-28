import { screen, within } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { PredictCard as PredictCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, type } from '../../theme';
import { PredictCard } from '../PredictCard';
import {
  answerAt,
  nextCardDisabled,
  optionNames,
  pickOption,
  renderChoiceCard,
} from '../testing/choiceCards';
import { demoCard } from '../testing/demoCards';

/** The page this card sits on in the tests: not 0, so an index mix-up shows. */
const INDEX = 3;
// README.md:77-83.
const TITLE = 'What plays in cycles 1 and 2?';
const CODE = 'note("c3 <e3 g3>")';
const OPTIONS = ['c3 e3, then c3 g3', 'c3 g3, then c3 e3', 'e3, then g3', 'c3 e3 g3, twice'];

// The demo predict card, read once through the data boundary (rule SS-6).
let demo: PredictCardData = cardsByType.predict;

beforeAll(async () => {
  demo = await demoCard('predict');
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the demo card at INDEX after storing `answers`. */
function renderPredict(answers: Record<number, CardAnswer> = {}) {
  return renderChoiceCard(
    (onNext) => <PredictCard card={demo} index={INDEX} onNext={onNext} />,
    answers,
  );
}

describe('PredictCard content, from the demo card (README.md:76-85)', () => {
  it('shows the kicker and estimate on the predict color, and a medium title', () => {
    renderPredict();

    for (const text of ['Predict · Alternation', '~45 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.predict.bg,
    );
    const title = screen.getByRole('header', { name: TITLE });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleM, color: colors.ink });
  });

  it("shows the card's code in a code block, with no comment", () => {
    renderPredict();

    expect(screen.getByTestId('code-block-code')).toHaveTextContent(CODE, { exact: true });
    expect(screen.queryByTestId('code-block-comment')).toBeNull();
  });

  it('lays out kicker, code, options, explanation, a flex spacer, then the button', () => {
    renderPredict({ [INDEX]: { kind: 'choice', picked: 0 } });
    // Queries return elements in tree order.
    const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(
      /^(card-kicker-row|code-block|choice-options|choice-explanation|predict-spacer|primary-button-face)$/,
    );

    expect(parts.map((part) => part.props.testID as unknown)).toStrictEqual([
      'card-kicker-row',
      'code-block',
      'choice-options',
      'choice-explanation',
      'predict-spacer',
      'primary-button-face',
    ]);
  });

  it('shows the four options in the body font, in two columns of cells at least 62 tall', () => {
    renderPredict();
    const rows = screen.getAllByTestId('choice-row');

    expect(optionNames()).toStrictEqual(OPTIONS);
    for (const label of OPTIONS) {
      expect(textStyleOf(screen.getByText(label))).toMatchObject(type.body);
    }
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getAllByTestId('choice-cell')).toHaveLength(2);
    }
    for (const cell of screen.getAllByTestId('choice-cell')) {
      expect(viewStyleOf(cell).minHeight).toBeGreaterThanOrEqual(62);
    }
  });
});

describe('PredictCard picking', () => {
  it('after the right pick: aqua text on the correct option, and the explanation', () => {
    renderPredict();

    pickOption('c3 e3, then c3 g3');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 0 });
    expect(textStyleOf(screen.getByText('c3 e3, then c3 g3')).color).toBe(colors.aqua);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(
      'Correct. c3 plays every cycle. The bracket alternates e3, g3, e3, g3… so odd cycles get e3.',
    );
    expect(nextCardDisabled()).toBe(false);
  });

  it('after a wrong pick: that option wrong, the right one shown, and Not quite.', () => {
    renderPredict();

    pickOption('c3 e3 g3, twice');

    expect(optionNames()).toStrictEqual([
      'c3 e3, then c3 g3. Correct answer.',
      'c3 g3, then c3 e3',
      'e3, then g3',
      'c3 e3 g3, twice. Not correct.',
    ]);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Not quite\. c3 plays/);
  });

  it('shows the answered state for an answer already stored at its index', () => {
    renderPredict({ [INDEX]: { kind: 'choice', picked: 2 } });

    expect(optionNames()[2]).toBe('e3, then g3. Not correct.');
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(/^Not quite\./);
    expect(nextCardDisabled()).toBe(false);
  });

  it('ignores an answer stored at another index', () => {
    renderPredict({ [INDEX - 1]: { kind: 'choice', picked: 0 } });

    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(nextCardDisabled()).toBe(true);
  });
});
