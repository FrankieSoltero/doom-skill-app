// The height budget of a Strudel exercise card (M10 plan T Task 1), by the method of
// ConceptCard.height.test.ts: summed from the values its parts are drawn with. With the title at
// `CARD_TEXT_LIMITS.exercise.title` (2 lines), four beat grid rows and a check message at the
// backend's 120 characters, the card fits the 543.5-point frame; a third title line does not.
//
// The starter code has no line limit: it sits in an editor of a fixed height that scrolls what it
// cannot show, so the card is as tall at one starter line as at ten.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { copy } from '../../copy';
import type { ExerciseCard as ExerciseCardData } from '../../data';
import { CARD_TEXT_LIMITS, CODE_LINE_FIELDS } from '../../data/textLimits';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { type } from '../../theme';
import { ExerciseCard } from '../ExerciseCard';
import { SourcesButton } from '../SourcesButton';
import { resetStrudelDouble, useStrudelDouble } from '../testing/strudelDouble';

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
/** A style with no line height (the kicker) takes 1.2 times its size: Barlow's `hhea` metrics. */
const NATURAL_LINE = 1.2;
/**
 * The average advance of a character, in em: 0.357 for the title font and 0.417 for body text,
 * measured from the bundled fonts over the demo text (src/data/textLimits.ts).
 */
const TITLE_ADVANCE = 0.357;
const BODY_ADVANCE = 0.417;
/** The characters a wrapped line can leave unused at its end (textLimits.ts's `WRAP_LOSS`). */
const WRAP_LOSS = 6;
/** The lines `CARD_TEXT_LIMITS.exercise.title` was derived from. */
const TITLE_LINES = 2;
/** The backend's own limit for each check message (card_limits.py). */
const MESSAGE_CHARS = 120;
/**
 * The card body's children with a message showing: kicker row, title, the editor frame, the
 * buttons, the message, spacer, Next card.
 */
const BODY_CHILDREN = 7;

const { gridRows, title: TITLE_CHARS } = CARD_TEXT_LIMITS.exercise;
const fill = (length: number) => 'x'.repeat(length);

/** Starter code of `lines` lines whose first line names `gridRows` samples: one grid row each. */
function starterOf(lines: number): string {
  const sounds = ['bd ~ sd ~', 'hh*4', '~ cp', 'rim ~'].slice(0, gridRows);
  const first = `stack(${sounds.map((sound) => `s("${sound}")`).join(', ')})`;
  return [first, ...Array.from({ length: lines - 1 }, () => '  .gain(0.8)')].join('\n');
}

/** The exercise at its title limit and messages of 120, its starter `lines` lines, failing. */
const maximal = (lines: number): ExerciseCardData => ({
  ...cardsByType.exercise,
  title: fill(TITLE_CHARS),
  starterCode: starterOf(lines),
  checks: [{ kind: 'contains', value: 'never written', ignoreWhitespace: true }],
  passMsg: fill(MESSAGE_CHARS),
  failMsg: fill(MESSAGE_CHARS),
});

/**
 * Draws the exercise with a starter of `lines` lines in a Strudel set, beside the Sources action
 * whose icon a card from the API has in its kicker row, and presses Check, so the failing
 * message shows.
 */
function renderMaximal(lines: number): void {
  const card = maximal(lines);
  const drawn = createElement(ExerciseCard, { card, index: 0, active: true, onNext: jest.fn() });
  render(createElement(Fragment, null, createElement(SourcesButton), drawn));
  fireEvent.press(screen.getByRole('button', { name: 'Check' }));
}

/** The drawn editor's height, fixed whatever the code. */
const editorHeight = () => Number(textStyleOf(screen.getByLabelText('Code editor')).height);

/** The editor frame: its border inset, the editor, the divider and the beat grid's rows. */
function editorFrameHeight(): number {
  const inset = 2 * Number(viewStyleOf(screen.getByTestId('exercise-editor-frame')).padding);
  const divider = Number(viewStyleOf(screen.getByTestId('exercise-divider')).height);
  const grid = viewStyleOf(screen.getByTestId('beat-grid'));
  const [cell] = screen.getAllByTestId('beat-grid-cell');
  const [label] = screen.getAllByTestId('beat-grid-label');
  if (cell === undefined || label === undefined) throw new Error('no grid row');
  const row = Math.max(Number(viewStyleOf(cell).height), Number(textStyleOf(label).lineHeight));
  const rows = screen.getAllByTestId('beat-grid-row').length;
  const padding = Number(grid.paddingTop) + Number(grid.paddingBottom);
  const gridHeight = padding + rows * row + (rows - 1) * Number(grid.gap);
  return inset + editorHeight() + divider + gridHeight;
}

/** The drawn message's style: the `BoldText`'s own, not a span's. */
function messageStyle() {
  const [text] = screen.getByTestId('result-badge-message').children;
  if (text === undefined || typeof text === 'string') throw new Error('no message');
  return textStyleOf(text);
}

/**
 * The lines a message at 120 takes beside its label: at most, the lines its characters need at
 * the characters a line holds beside the longer label (each line but the last losing a word end);
 * at fewest, its characters' width across the row with no label glyphs at all.
 */
function messageLines(): { most: number; fewest: number } {
  const label = textStyleOf(screen.getByTestId('result-badge-label'));
  const gap = Number(viewStyleOf(screen.getByTestId('result-badge')).gap);
  const labelChars = Math.max(copy.specMet.length, copy.notYet.length);
  const labelGlyphs = labelChars * Number(label.fontSize) * TITLE_ADVANCE;
  const bare = CONTENT_WIDTH - gap - 2 * Number(label.paddingHorizontal);
  const advance = Number(messageStyle().fontSize) * BODY_ADVANCE;
  const perLine = Math.floor((bare - labelGlyphs) / advance);
  let most = 1;
  while (most * perLine - (most - 1) * WRAP_LOSS < MESSAGE_CHARS) most += 1;
  return { most, fewest: Math.ceil((MESSAGE_CHARS * advance) / bare) };
}

/** The drawn card's content height with the title in `titleLines` and the message in `lines`. */
function exerciseHeight(titleLines: number, lines: number): number {
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const title = titleLines * Number(textStyleOf(screen.getByRole('header')).lineHeight);
  const controls = Number(viewStyleOf(screen.getByRole('button', { name: 'Check' })).height);
  const message = lines * Number(messageStyle().lineHeight);
  const gaps = (BODY_CHILDREN - 1) * Number(viewStyleOf(screen.getByTestId('card-frame-body')).gap);
  return kicker + title + editorFrameHeight() + controls + message + BUTTON_HEIGHT + gaps;
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('the exercise card height budget', () => {
  it('limits the title to 54 characters and the starter code to no line count', () => {
    expect(TITLE_CHARS).toBe(54);
    expect(Object.keys(CARD_TEXT_LIMITS.exercise).sort()).toStrictEqual(['gridRows', 'title']);
    expect(Object.keys(CODE_LINE_FIELDS)).not.toContain('exercise');
  });

  it('at its limits, 4 grid rows and a message of 120 at its most lines: 536.6 points', () => {
    renderMaximal(1);
    const { most } = messageLines();

    const sum = exerciseHeight(TITLE_LINES, most);

    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(String(screen.getByRole('header').props.children)).toHaveLength(54);
    expect(screen.getAllByTestId('beat-grid-row')).toHaveLength(gridRows);
    expect(most).toBe(4);
    expect(sum).toBeCloseTo(536.6, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it('a third title line is over the frame, even with the message at its fewest lines: 543.6', () => {
    renderMaximal(1);
    const { fewest } = messageLines();

    const sum = exerciseHeight(TITLE_LINES + 1, fewest);

    expect(fewest).toBe(3);
    expect(sum).toBeCloseTo(543.6, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });

  it('keeps the editor at 100 points, and the card as tall, for a 1-line and a 10-line starter', () => {
    renderMaximal(1);
    const oneLine = { editor: editorHeight(), card: exerciseHeight(TITLE_LINES, 4) };
    screen.unmount();

    renderMaximal(10);

    expect(oneLine.editor).toBe(100);
    expect(editorHeight()).toBe(100);
    expect(screen.getAllByTestId('beat-grid-row')).toHaveLength(gridRows);
    expect(exerciseHeight(TITLE_LINES, 4)).toBe(oneLine.card);
  });
});
