// The height budget of the prose choice cards (M9 plan C Task 22) and the numeric card (M9 plan
// D): an answered cloze, scenario and numeric card at their text limits, summed from the
// constants their parts draw with, must fit the card's content box on the reference device. The
// card body does not scroll, so a change that pushes any of them past its page fails here, as
// SummaryCard.height.test.ts does for the Summary.
//
// The answered predict card of a Strudel set (M9 plan I Task 5) has the Play / Stop control beside
// its code, which adds no height, and while the audio needs attention a notice under the code.
// Four options (README.md:79's 2x2 grid) are chosen, as the prose grid's. M10 plan T Task 1 adds
// `CARD_TEXT_LIMITS.predict.option` (2 lines of a grid cell in the code font) and `codeLines`:
// with each notice in turn under the code that many lines fit, and one more does not. The quiz's
// option limit, 48, takes 4 lines of a grid cell, and four such options are over the frame with
// one code line and no notice.
import { render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement } from 'react';

import { COMPACT_PADDING_X, COMPACT_PADDING_Y } from '../../components/OptionButton';
import { PASSAGE_PADDING_X, PASSAGE_PADDING_Y, PASSAGE_RULE } from '../../components/Passage';
import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { PredictCard as PredictCardData } from '../../data';
import { CARD_TEXT_LIMITS, lineCount } from '../../data/textLimits';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { border, space, type } from '../../theme';
import { CELL_MIN_HEIGHT, EXPLANATION_LINE_HEIGHT, GRID_COLUMNS, OPTION_GAP } from '../ChoiceBody';
import { ClozeCard } from '../ClozeCard';
import { NumericCard } from '../NumericCard';
import { PredictCard } from '../PredictCard';
import { ScenarioCard } from '../ScenarioCard';
import { SourcesButton } from '../SourcesButton';
import { gridCells, partsInOrder } from '../testing/choiceCards';
import { NOTICE_AUDIO, noticeHeight, type NoticeName } from '../testing/noticeHeights';
import { startSetIn } from '../testing/playingSets';
import { resetStrudelDouble, setAudio, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

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
/**
 * The answered card body's children: kicker row, title, the passage or the code, options,
 * explanation, spacer, button.
 */
const BODY_CHILDREN = 7;
/** The predict card's options at their most, as chosen above. */
const PREDICT_OPTIONS = 4;
/** Menlo's advance, the same for every character: 0.602 em (src/data/textLimits.ts). */
const MENLO_ADVANCE = 0.602;
/** The quiz's option limit, which predict used before its own (M10 plan T Task 1). */
const QUIZ_OPTION = CARD_TEXT_LIMITS.quiz.option;

const fill = (length: number) => 'x'.repeat(length);
/** A predict option's text of `length` characters, apart from the title's and explanation's. */
const optionOf = (length: number) => 'o'.repeat(length);
/** A predict option at its limit. */
const PREDICT_OPTION = optionOf(CARD_TEXT_LIMITS.predict.option);

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
 * The height of a grid of `options` options whose text takes `lines` lines (2 at the prose limit)
 * of `lineHeight` points.
 */
function gridHeight(options: number, lineHeight: number, lines: number = LINES.gridOption): number {
  const optionFace = lines * lineHeight + 2 * COMPACT_PADDING_Y + 2 * border.strong;
  const rows = Math.ceil(options / GRID_COLUMNS);
  return rows * Math.max(CELL_MIN_HEIGHT, optionFace) + (rows - 1) * OPTION_GAP;
}

/**
 * The answered card's content height at its limits, with `middle` (the passage or the code)
 * between the title and the options, and `grid` the options. The kicker row is as tall as the
 * taller of the kicker's line and the Sources icon, `iconSize` (the flag's icon is the same size).
 */
function choiceHeight(middle: number, grid: number, iconSize: number): number {
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, iconSize);
  const title = LINES.title * type.cardTitleM.lineHeight;
  const explanation = LINES.explanation * EXPLANATION_LINE_HEIGHT;
  const gaps = (BODY_CHILDREN - 1) * space[4];
  return kicker + title + middle + grid + explanation + BUTTON_HEIGHT + gaps;
}

/** A prose card's answered height at its limits: a passage, and grid options in the body font. */
function proseHeight(cardType: ProseType, iconSize: number): number {
  const passage = LINES.passage * type.body.lineHeight + 2 * PASSAGE_PADDING_Y;
  const grid = gridHeight(CARD_TEXT_LIMITS[cardType].options, type.body.lineHeight);
  return choiceHeight(passage, grid, iconSize);
}

/** A predict card at its title and explanation limits, with `codeLines` lines and `option`s. */
const maximalPredict = (codeLines: number, option: string): PredictCardData => ({
  ...cardsByType.predict,
  title: fill(CARD_TEXT_LIMITS.predict.title),
  code: Array.from({ length: codeLines }, () => 'note("c3 <e3 g3>")').join('\n'),
  options: Array.from({ length: PREDICT_OPTIONS }, () => option),
  explanation: fill(CARD_TEXT_LIMITS.predict.explanation),
});
const { codeLines: CODE_LINES } = CARD_TEXT_LIMITS.predict;

/** The answered predict card's body children, the title aside, in a Strudel set. */
const PREDICT_PARTS = [
  'card-kicker-row',
  'playable-code',
  'choice-options',
  'choice-explanation',
  'predict-spacer',
  'primary-button-face',
];

/**
 * Draws a predict card with `codeLines` lines of code and options of `option` (at their limits by
 * default) answered, at page 0 of a set whose topic has `lang`. Returns the code lines drawn,
 * counted as the server counts them.
 */
function renderPredictIn(lang: 'strudel' | 'sql', codeLines = CODE_LINES, option = PREDICT_OPTION) {
  const card = maximalPredict(codeLines, option);
  startSetIn([card], lang);
  useFeedStore.getState().setAnswer(0, { kind: 'choice', picked: 0 });
  render(createElement(PredictCard, { card, index: 0, active: false, onNext: jest.fn() }));
  return lineCount(card.code);
}

/** The drawn code block's height: its padding above and below, and its `lines` code lines. */
function codeBlockHeight(lines: number): number {
  const padding = Number(viewStyleOf(screen.getByTestId('code-block-content')).paddingVertical);
  return (
    2 * padding + lines * Number(textStyleOf(screen.getByTestId('code-block-code')).lineHeight)
  );
}

/** The code row of the drawn playing predict card: the block and the control side by side. */
function codeRowHeight(lines: number): number {
  const control = Number(viewStyleOf(screen.getByTestId('playable-code-control')).height);
  return Math.max(codeBlockHeight(lines), control);
}

/** What the drawn `notice` adds under the code: the column's gap, then the notice. */
function noticeAdded(notice: NoticeName): number {
  return Number(viewStyleOf(screen.getByTestId('playable-code')).gap) + noticeHeight(notice);
}

/**
 * The lines a drawn option of unbroken characters takes in a grid cell: the characters a line of
 * the code font holds across the cell's text width, rounded down, and as many lines as it fills.
 */
function optionLines(option: ReturnType<typeof screen.getByText>, text: string): number {
  const perLine = Math.floor(
    gridTextWidth / (Number(textStyleOf(option).fontSize) * MENLO_ADVANCE),
  );
  return Math.ceil(text.length / perLine);
}

/**
 * The drawn playing predict card's height with `codeLines` lines of code and options `text`, with
 * no notice under its code.
 */
function predictHeight(iconSize: number, codeLines: number, text = PREDICT_OPTION): number {
  const options = screen.getAllByText(text);
  const optionLine = Math.max(...options.map((option) => Number(textStyleOf(option).lineHeight)));
  const lines = Math.max(...options.map((option) => optionLines(option, text)));
  const grid = gridHeight(PREDICT_OPTIONS, optionLine, lines);
  return choiceHeight(codeRowHeight(codeLines), grid, iconSize);
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('the prose choice cards height budget', () => {
  it.each([
    { cardType: 'cloze', height: 528 },
    { cardType: 'scenario', height: 528 },
    { cardType: 'numeric', height: 528 },
  ] as const)('an answered $cardType at its limits: $height points, inside 543.5', (budget) => {
    const iconSize = sourcesIconSize();
    renderMaximal(budget.cardType);

    const sum = proseHeight(budget.cardType, iconSize);

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

describe('the playing predict card height budget', () => {
  it('an answered predict at its limits: 461.6 points, the control adding 0, inside 543.5', () => {
    const iconSize = sourcesIconSize();
    const plainLines = renderPredictIn('sql');
    const plainBlock = codeBlockHeight(plainLines);
    expect(screen.queryByTestId('playable-code')).toBeNull();
    screen.unmount();

    const codeLines = renderPredictIn('strudel');
    const sum = predictHeight(iconSize, codeLines);

    expect(partsInOrder(new RegExp(`^(${PREDICT_PARTS.join('|')})$`))).toStrictEqual(PREDICT_PARTS);
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(gridCells()).toStrictEqual([GRID_COLUMNS, GRID_COLUMNS]);
    expect(screen.queryAllByTestId('audio-notice')).toHaveLength(0);
    expect(plainBlock).toBe(50);
    expect(codeRowHeight(codeLines)).toBe(plainBlock);
    expect(sum).toBeCloseTo(461.6, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it.each([
    { notice: 'unavailable', added: 57.6, height: 519.2 },
    { notice: 'error', added: 79.6, height: 541.2 },
    { notice: 'needs network', added: 35.6, height: 497.2 },
  ] as const)('"$notice" adds $added under the code: $height points, inside 543.5', (row) => {
    const iconSize = sourcesIconSize();
    const base = predictHeight(iconSize, renderPredictIn('strudel'));
    setAudio(NOTICE_AUDIO[row.notice]);

    const added = noticeAdded(row.notice);

    expect(screen.getByTestId('audio-notice')).toBeOnTheScreen();
    expect(added).toBeCloseTo(row.added, 5);
    expect(base + added).toBeCloseTo(row.height, 5);
    expect(base + added).toBeLessThanOrEqual(CONTENT_BOX);
  });
});

describe('the predict card budget', () => {
  it('limits an option to 2 lines of a grid cell and the code to 1 line', () => {
    renderPredictIn('strudel');
    const [option] = screen.getAllByText(PREDICT_OPTION);
    if (option === undefined) throw new Error('no option');

    expect(CARD_TEXT_LIMITS.predict.option).toBe(22);
    expect(CODE_LINES).toBe(1);
    expect(optionLines(option, PREDICT_OPTION)).toBe(LINES.gridOption);
  });

  it('one more code line, with the error notice, is over the frame: 563.2 points', () => {
    const iconSize = sourcesIconSize();
    const codeLines = renderPredictIn('strudel', CODE_LINES + 1);
    const base = predictHeight(iconSize, codeLines);
    setAudio(NOTICE_AUDIO.error);

    const sum = base + noticeAdded('error');

    expect(codeLines).toBe(CODE_LINES + 1);
    expect(sum).toBeCloseTo(563.2, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });

  it("the quiz's 48-character options take 4 lines: 549.6 points, 1 code line, no notice", () => {
    const iconSize = sourcesIconSize();
    const wide = optionOf(QUIZ_OPTION);
    const codeLines = renderPredictIn('strudel', CODE_LINES, wide);
    const [option] = screen.getAllByText(wide);
    if (option === undefined) throw new Error('no option');

    const sum = predictHeight(iconSize, codeLines, wide);

    expect(QUIZ_OPTION).toBe(48);
    expect(optionLines(option, wide)).toBe(4);
    expect(sum).toBeCloseTo(549.6, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });
});
