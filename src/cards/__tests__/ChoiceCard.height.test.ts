// The height budget of the prose choice cards (M9 plan C Task 22) and the numeric card (M9 plan
// D): an answered cloze, scenario and numeric card at their text limits, summed from the
// constants their parts draw with, must fit the card's content box on the reference device. The
// card body does not scroll, so a change that pushes any of them past its page fails here, as
// SummaryCard.height.test.ts does for the Summary.
import { render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement } from 'react';

import { COMPACT_PADDING_X, COMPACT_PADDING_Y } from '../../components/OptionButton';
import { PASSAGE_PADDING_X, PASSAGE_PADDING_Y, PASSAGE_RULE } from '../../components/Passage';
import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { CARD_TEXT_LIMITS } from '../../data/textLimits';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { border, space, type } from '../../theme';
import { CELL_MIN_HEIGHT, EXPLANATION_LINE_HEIGHT, GRID_COLUMNS, OPTION_GAP } from '../ChoiceBody';
import { ClozeCard } from '../ClozeCard';
import { NumericCard } from '../NumericCard';
import { ScenarioCard } from '../ScenarioCard';
import { SourcesButton } from '../SourcesButton';
import { gridCells, partsInOrder } from '../testing/choiceCards';

/**
 * The card body's content box on the 390x844 reference device (SummaryCard.height.test.ts): 309
 * wide and 543.5 tall.
 */
const CONTENT_WIDTH = 309;
const CONTENT_BOX = 543.5;
/**
 * The line height of a text style that sets none (the kicker): Barlow's `hhea` ascent and descent
 * are 1000 and 200 per 1000 units, so a line is 1.2 times the font size.
 */
const NATURAL_LINE = 1.2;
/**
 * The lines each field takes at its limit: the lines `CARD_TEXT_LIMITS` was derived from
 * (src/data/textLimits.ts, which keeps its characters per line to itself). The passage and a grid
 * option are measured across the widths the second test pins.
 */
const LINES = { title: 2, passage: 4, gridOption: 2, explanation: 3 } as const;

type ProseType = 'cloze' | 'scenario' | 'numeric';

/**
 * The card body's children once answered, by test ID, the title aside: kicker row, passage,
 * options, explanation, spacer, button.
 */
function bodyParts(cardType: ProseType): string[] {
  const parts = ['card-kicker-row', 'passage', 'choice-options', 'choice-explanation'];
  return [...parts, `${cardType}-spacer`, 'primary-button-face'];
}

/** The width a passage's text wraps in: the content width less the rule and the side padding. */
const passageTextWidth = CONTENT_WIDTH - PASSAGE_RULE - 2 * PASSAGE_PADDING_X;

/** The width a grid option's text wraps in: half the row less the gap, the borders and padding. */
const gridTextWidth =
  (CONTENT_WIDTH - (GRID_COLUMNS - 1) * OPTION_GAP) / GRID_COLUMNS -
  2 * border.strong -
  2 * COMPACT_PADDING_X;

/**
 * The size of the Sources icon in a card's kicker row, as drawn (a card from the API has one).
 * The flag's icon is the same size.
 */
function sourcesIconSize(): number {
  const { unmount } = render(createElement(SourcesButton));
  const size = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  unmount();
  return size;
}

/** Draws `cardType`'s card from the test sets, answered, with every limited field at its limit. */
function renderMaximal(cardType: ProseType): void {
  const limits = CARD_TEXT_LIMITS[cardType];
  const fill = (length: number) => 'x'.repeat(length);
  const shared = {
    title: fill(limits.title),
    options: Array.from({ length: limits.options }, () => fill(limits.option)),
    explanation: fill(limits.explanation),
  };
  const props = { index: 0, onNext: jest.fn() };
  useFeedStore.setState({ answers: { 0: { kind: 'choice', picked: 0 } } });
  if (cardType === 'cloze') {
    const card = { ...cardsByType.cloze, ...shared, text: fill(CARD_TEXT_LIMITS.cloze.text) };
    render(createElement(ClozeCard, { card, ...props }));
    return;
  }
  if (cardType === 'numeric') {
    const problem = fill(CARD_TEXT_LIMITS.numeric.problem);
    render(
      createElement(NumericCard, {
        card: { ...cardsByType.numeric, ...shared, problem },
        ...props,
      }),
    );
    return;
  }
  const situation = fill(CARD_TEXT_LIMITS.scenario.situation);
  const card = { ...cardsByType.scenario, ...shared, situation };
  render(createElement(ScenarioCard, { card, ...props }));
}

/**
 * The answered card's content height at its limits. The kicker row is as tall as the taller of
 * the kicker's line and the Sources icon, `iconSize` (the flag's icon is the same size).
 */
function choiceHeight(cardType: ProseType, iconSize: number): number {
  const { options } = CARD_TEXT_LIMITS[cardType];
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, iconSize);
  const title = LINES.title * type.cardTitleM.lineHeight;
  const passage = LINES.passage * type.body.lineHeight + 2 * PASSAGE_PADDING_Y;
  const optionFace =
    LINES.gridOption * type.body.lineHeight + 2 * COMPACT_PADDING_Y + 2 * border.strong;
  const rows = Math.ceil(options / GRID_COLUMNS);
  const grid = rows * Math.max(CELL_MIN_HEIGHT, optionFace) + (rows - 1) * OPTION_GAP;
  const explanation = LINES.explanation * EXPLANATION_LINE_HEIGHT;
  // The body's children are its parts and the title, with a gap between each two.
  const gaps = bodyParts(cardType).length * space[4];
  return kicker + title + passage + grid + explanation + BUTTON_HEIGHT + gaps;
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('the prose choice cards height budget', () => {
  it.each([
    { cardType: 'cloze', height: 528 },
    { cardType: 'scenario', height: 528 },
    { cardType: 'numeric', height: 528 },
  ] as const)('an answered $cardType at its limits: $height points, inside 543.5', (budget) => {
    const iconSize = sourcesIconSize();
    renderMaximal(budget.cardType);

    const sum = choiceHeight(budget.cardType, iconSize);

    const parts = bodyParts(budget.cardType);
    expect(partsInOrder(new RegExp(`^(${parts.join('|')})$`))).toStrictEqual(parts);
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(gridCells()).toStrictEqual([GRID_COLUMNS, GRID_COLUMNS]);
    expect(sum).toBeCloseTo(budget.height, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it('wraps a passage and a grid option across the widths textLimits.ts measured lines in', () => {
    expect(passageTextWidth).toBeCloseTo(280.3, 5);
    expect(gridTextWidth).toBeCloseTo(123.5, 5);
  });
});
