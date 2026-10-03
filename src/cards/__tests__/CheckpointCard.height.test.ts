// The height budget of the checkpoint card (M9 plan J Task 4), by the method of
// ChoiceCard.height.test.ts: the card at its text limits, summed from the values its parts are
// drawn with, must fit the card's content box on the reference device. The card body does not
// scroll.
//
// A written card after its submit: kicker row, a title of 2 lines, the editor, the sent line,
// spacer, Finish today. A code card after a failing grade is the row for comparison: the editor,
// 4 rubric rows of 1 line (`CARD_TEXT_LIMITS.checkpoint`), the score line and 2 lines of feedback.
// Under both, once a card the API served is submitted, sits the server's grade
// (`CheckpointFeedback`): a scroll area at most six small lines tall that shrinks to the room left
// (`flexShrink`), so the test reports that room. A written card leaves it all of its height (81.9
// points to spare). A code card at its limits leaves it 8.8 points, less than one line: an open
// item from before this plan, not this task's to fix.
import { render, screen, within } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';
import { TextInput } from 'react-native';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { CheckpointCard as CheckpointCardData } from '../../data';
import type { CardAnswer } from '../../feed/answers';
import { gradeCheckpoint } from '../../feed/checkpoint';
import { useFeedStore } from '../../feed/store';
import { type } from '../../theme';
import { CheckpointCard } from '../CheckpointCard';
import { SourcesButton } from '../SourcesButton';
import { setUpCheckpointCardTests } from '../testing/checkpointCards';

/** The card body's content box on the 390x844 reference device (SummaryCard.height.test.ts). */
const CONTENT_BOX = 543.5;
/** A style with no line height (the kicker) takes 1.2 times its size: Barlow's `hhea` metrics. */
const NATURAL_LINE = 1.2;
/** The title's lines at its most, as the plan sets them. */
const TITLE_LINES = 2;
/**
 * The sent line's lines: its 57 characters of Barlow 13, at 5.42 points a character (the 6.25 of
 * Barlow 15 in src/data/textLimits.ts, scaled), take the whole 309 width, so 2 are allowed for.
 */
const SENT_LINES = 2;
/** The fail feedback's lines: "Needs at least 3 of 4. Check …" is 63 characters, 341 points. */
const FEEDBACK_LINES = 2;
/** The most lines of small text the server's grade area takes before it scrolls. */
const SERVER_LINES = 6;
/** A rubric label at its limit takes one line. */
const LABEL_LINES = 1;
/** The answer's text, which the height does not depend on: the editor scrolls. */
const ANSWER = 'A dividend is a share of profit paid to the owners of a stock.';
/** The code of the comparison row: a kick drum only, one of the demo's 4 items, a fail. */
const ONE = 's("bd*4")';

const demo = setUpCheckpointCardTests();

/**
 * Draws `card` at page 0 over `answer`, with the Sources action beside it to read the icon size
 * the kicker row of a card from the API holds (the flag's icon is the same size).
 */
function renderAt(card: CheckpointCardData, answer: CardAnswer): void {
  useFeedStore.setState({ answers: { 0: answer } });
  const drawn = createElement(CheckpointCard, {
    card,
    index: 0,
    active: false,
    onNext: jest.fn(),
  });
  render(createElement(Fragment, null, createElement(SourcesButton), drawn));
}

/** The line height of the text with test ID `id`. */
const lineOf = (id: string) => Number(textStyleOf(screen.getByTestId(id)).lineHeight);

/** The first drawn element with test ID `id`. */
function firstOf(id: string) {
  const [first] = screen.getAllByTestId(id);
  if (first === undefined) throw new Error(`nothing drawn with ${id}`);
  return first;
}

/** The drawn rubric's height: its top rule, then each row, its padding and the line under it. */
function rubricHeight(): number {
  const list = viewStyleOf(screen.getByTestId('rubric-list'));
  const row = viewStyleOf(firstOf('rubric-row'));
  const box = Number(viewStyleOf(firstOf('rubric-box')).height);
  const label =
    LABEL_LINES * Number(textStyleOf(screen.getByText('Kick drum (bd) present')).lineHeight);
  const line = Number(viewStyleOf(firstOf('rubric-line')).height);
  const each = 2 * Number(row.paddingVertical) + Math.max(box, label) + line;
  return Number(list.borderTopWidth) + screen.getAllByTestId('rubric-row').length * each;
}

/** The body's parts with a test ID, as drawn in order; the title is the one part without. */
function drawnParts(): string[] {
  const body = screen.getByTestId('card-frame-body');
  const ids =
    /^(card-kicker-row|checkpoint-(editor-panel|result|detail|spacer)|rubric-list|primary-button-face)$/;
  return within(body)
    .getAllByTestId(ids)
    .map((part) => String(part.props.testID));
}

/**
 * The drawn card's content height without the server's grade, every part read from its drawn
 * style, with the gap the grade area adds when it is drawn: the parts, the title and the grade
 * area, less one, are the gaps. `middle` is what sits between the editor and the spacer.
 */
function fixedHeight(middle: number): number {
  const gap = Number(viewStyleOf(screen.getByTestId('card-frame-body')).gap);
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const title = TITLE_LINES * Number(textStyleOf(screen.getByRole('header')).lineHeight);
  const editor = Number(textStyleOf(screen.UNSAFE_getByType(TextInput)).height);
  const children = drawnParts().length + 2;
  return kicker + title + editor + middle + BUTTON_HEIGHT + (children - 1) * gap;
}

/** The parts of both rows, the rubric aside. */
const PARTS = [
  'card-kicker-row',
  'checkpoint-editor-panel',
  'checkpoint-result',
  'checkpoint-spacer',
  'primary-button-face',
];

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('the checkpoint card height budget', () => {
  it('a written card after its submit, at its limits: 347.6 points, room for the whole grade', () => {
    const card = { ...demo(), written: true, rubric: [], passThreshold: 0, starterCode: '' };
    renderAt(card, { kind: 'checkpoint', code: ANSWER, status: 'sent', grade: null });

    const sum = fixedHeight(SENT_LINES * lineOf('checkpoint-sent'));
    const area = SERVER_LINES * type.small.lineHeight;

    expect(drawnParts()).toStrictEqual(PARTS);
    expect(sum).toBeCloseTo(347.6, 5);
    expect(area).toBe(114);
    expect(CONTENT_BOX - sum - area).toBeCloseTo(81.9, 5);
  });

  it('a code card after a failing grade, at its limits: 534.7 points, for comparison', () => {
    const grade = gradeCheckpoint(ONE, demo());
    renderAt(demo(), { kind: 'checkpoint', code: ONE, status: 'done', grade });
    const result = lineOf('checkpoint-score') + FEEDBACK_LINES * lineOf('checkpoint-feedback');
    const resultGap = Number(viewStyleOf(screen.getByTestId('checkpoint-result')).gap);

    const sum = fixedHeight(rubricHeight() + result + resultGap);

    expect(drawnParts()).toStrictEqual(PARTS.toSpliced(2, 0, 'rubric-list'));
    expect(screen.getAllByTestId('rubric-row')).toHaveLength(4);
    expect(sum).toBeCloseTo(534.7, 5);
    expect(CONTENT_BOX - sum).toBeCloseTo(8.8, 5);
  });
});
