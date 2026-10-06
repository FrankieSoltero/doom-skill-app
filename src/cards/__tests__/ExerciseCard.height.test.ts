// The height of a Strudel exercise card (M10 plan T Task 1), by the method of
// ConceptCard.height.test.ts: summed from the values its parts are drawn with.
//
// The starter code sits in an editor of a fixed height that scrolls what it cannot show, so the
// card is as tall at any number of starter lines. `CARD_TEXT_LIMITS.exercise.starterLines` is the
// lines the editor shows whole, without scrolling: one more line scrolls in the editor, and leaves
// the card as tall as it was.
//
// Open item, not this task's to fix: the backend's own limits for the title (80 characters) and
// the check messages (120 each; `services/api/app/models/card_limits.py`) are not derived from the
// frame. At the fewest lines those take, with four grid rows and a message showing, the card is
// 543.6 points, over the 543.5 frame by 0.1 whatever the starter.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { ExerciseCard as ExerciseCardData } from '../../data';
import { CARD_TEXT_LIMITS, CODE_LINE_FIELDS, lineCount } from '../../data/textLimits';
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
/** The backend's own limits for the title and each check message (card_limits.py). */
const TITLE_CHARS = 80;
const MESSAGE_CHARS = 120;
/**
 * The card body's children with a message showing: kicker row, title, the editor frame, the
 * buttons, the message, spacer, Next card.
 */
const BODY_CHILDREN = 7;

const { gridRows, starterLines } = CARD_TEXT_LIMITS.exercise;
const fill = (length: number) => 'x'.repeat(length);

/** Starter code of `lines` lines whose first line names `gridRows` samples: one grid row each. */
function starterOf(lines: number): string {
  const sounds = ['bd ~ sd ~', 'hh*4', '~ cp', 'rim ~'].slice(0, gridRows);
  const first = `stack(${sounds.map((sound) => `s("${sound}")`).join(', ')})`;
  return [first, ...Array.from({ length: lines - 1 }, () => '  .gain(0.8)')].join('\n');
}

/** The exercise at the title and message limits, its starter `lines` lines, failing its check. */
const maximal = (lines: number): ExerciseCardData => ({
  ...cardsByType.exercise,
  title: fill(TITLE_CHARS),
  starterCode: starterOf(lines),
  checks: [{ kind: 'contains', value: 'never written', ignoreWhitespace: true }],
  passMsg: fill(MESSAGE_CHARS),
  failMsg: fill(MESSAGE_CHARS),
});

/** The fewest lines `chars` characters take at `advance` em of `fontSize` across `width`. */
function fewestLines(chars: number, fontSize: number, advance: number, width: number): number {
  return Math.ceil((chars * fontSize * advance) / width);
}

/**
 * Draws the exercise with a starter of `lines` lines in a Strudel set, beside the Sources action
 * whose icon a card from the API has in its kicker row, and presses Check, so the failing
 * message shows. Returns the starter's lines, counted as the server counts them.
 */
function renderMaximal(lines: number): number {
  const card = maximal(lines);
  const drawn = createElement(ExerciseCard, { card, index: 0, active: true, onNext: jest.fn() });
  render(createElement(Fragment, null, createElement(SourcesButton), drawn));
  fireEvent.press(screen.getByRole('button', { name: 'Check' }));
  return lineCount(card.starterCode);
}

/** The drawn editor's style: its fixed height, its padding and its code line. */
function editorStyle() {
  const style = textStyleOf(screen.getByLabelText('Code editor'));
  const line = Number(style.lineHeight);
  return { height: Number(style.height), padding: Number(style.paddingVertical), line };
}

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
  return inset + editorStyle().height + divider + gridHeight;
}

/** The message row at the fewest lines a message at its limit takes beside its label. */
function messageHeight(): number {
  const label = textStyleOf(screen.getByTestId('result-badge-label'));
  const gap = Number(viewStyleOf(screen.getByTestId('result-badge')).gap);
  const width = CONTENT_WIDTH - gap - 2 * Number(label.paddingHorizontal);
  const [text] = screen.getByTestId('result-badge-message').children;
  if (text === undefined || typeof text === 'string') throw new Error('no message');
  // The message is a `BoldText`: its own style, not a span's.
  const message = textStyleOf(text);
  const lines = fewestLines(MESSAGE_CHARS, Number(message.fontSize), BODY_ADVANCE, width);
  return lines * Number(message.lineHeight);
}

/** The drawn card's content height, the title and the message at their fewest lines. */
function exerciseHeight(): number {
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const title = textStyleOf(screen.getByRole('header'));
  const titleLines = fewestLines(TITLE_CHARS, Number(title.fontSize), TITLE_ADVANCE, CONTENT_WIDTH);
  const controls = Number(viewStyleOf(screen.getByRole('button', { name: 'Check' })).height);
  const gaps = (BODY_CHILDREN - 1) * Number(viewStyleOf(screen.getByTestId('card-frame-body')).gap);
  const parts = editorFrameHeight() + controls + messageHeight() + BUTTON_HEIGHT;
  return kicker + titleLines * Number(title.lineHeight) + parts + gaps;
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('the exercise card height budget', () => {
  it('limits the starter code to 3 lines, the field the server counts by CODE_LINE_FIELDS', () => {
    expect(CODE_LINE_FIELDS.exercise).toBe('starterLines');
    expect(CARD_TEXT_LIMITS.exercise[CODE_LINE_FIELDS.exercise]).toBe(3);
  });

  it('shows a starter of starterLines lines whole in the editor: 90 of its 100 points', () => {
    const lines = renderMaximal(starterLines);
    const editor = editorStyle();

    expect(lines * editor.line + 2 * editor.padding).toBe(90);
    expect(lines * editor.line + 2 * editor.padding).toBeLessThanOrEqual(editor.height);
  });

  it('scrolls one more line in the editor: 112 points of code in its 100', () => {
    const lines = renderMaximal(starterLines + 1);
    const editor = editorStyle();

    expect(lines).toBe(starterLines + 1);
    expect(lines * editor.line + 2 * editor.padding).toBe(112);
    expect(lines * editor.line + 2 * editor.padding).toBeGreaterThan(editor.height);
  });

  it('is as tall at one more starter line: the editor keeps its height', () => {
    renderMaximal(starterLines);
    const atLimit = exerciseHeight();
    screen.unmount();

    renderMaximal(starterLines + 1);

    expect(screen.getAllByTestId('beat-grid-row')).toHaveLength(gridRows);
    expect(exerciseHeight()).toBe(atLimit);
  });

  it("at the backend's title and message limits, 4 grid rows: 543.6 points, over the frame", () => {
    renderMaximal(starterLines);

    const sum = exerciseHeight();

    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(screen.getAllByTestId('beat-grid-row')).toHaveLength(gridRows);
    expect(sum).toBeCloseTo(543.6, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });
});
