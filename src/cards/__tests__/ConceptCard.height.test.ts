// The height budget of a concept card that plays (M9 plan I Task 3), by the method of
// ChoiceCard.height.test.ts: a Strudel concept at its text limits, with the Play / Stop control
// beside its code and, in turn, the cycle tiles and each audio notice in their place, summed from
// the values its parts are drawn with, must fit the card's content box on the reference device.
//
// The snippet is `CARD_TEXT_LIMITS.concept.snippetLines` code lines plus the comment line (M10
// plan T Task 1): with the title and the body at their limits and the tiles under the code, the
// tallest of the four things drawn there, that many lines fit and one more does not. An 8-line
// snippet (the stored Strudel cards had up to 8) under a body at its limit is 652.6 points.
//
// A shorter body frees its lines for code (M10 plan T, T22 and T24): the server's
// `snippet_lines_allowed` gives a body of b lines, counted as `charsIn` counts them, 9 - b code
// lines, at most 8. Each body at the server's limit beside that many lines fits; one character
// more takes another body line and is over the frame.
import { render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { ConceptCard as ConceptCardData } from '../../data';
import { CARD_TEXT_LIMITS, CODE_LINE_FIELDS, lineCount } from '../../data/textLimits';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { space, type } from '../../theme';
import { ConceptCard } from '../ConceptCard';
import { SourcesButton } from '../SourcesButton';
import { NOTICE_AUDIO, noticeHeight, type NoticeName } from '../testing/noticeHeights';
import { resetStrudelDouble, setAudio, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

/** The card body's content box on the 390x844 reference device (SummaryCard.height.test.ts). */
const CONTENT_BOX = 543.5;
/** A style with no line height (the kicker) takes 1.2 times its size: Barlow's `hhea` metrics. */
const NATURAL_LINE = 1.2;
/** The lines `CARD_TEXT_LIMITS.concept` was derived from: a title of 2, a body of 6. */
const TITLE_LINES = 2;
const BODY_LINES = 6;
/** The card body's children: kicker row, title, body, the playable code, spacer, Got it. */
const BODY_CHILDREN = 6;

/** The most code lines a stored Strudel concept had before the budget. */
const STORED_LINES = 8;
/** textLimits.ts's concept body: 49 characters a line, less a wrap loss of 6 on each but the last. */
const BODY_PER_LINE = 49;
const WRAP_LOSS = 6;

/** The body lines `charsIn` gives `chars` characters: the fewest that hold them, at least 1. */
function bodyLinesOf(chars: number): number {
  let lines = 1;
  while (lines * BODY_PER_LINE - (lines - 1) * WRAP_LOSS < chars) lines += 1;
  return lines;
}

const fill = (length: number) => 'x'.repeat(length);
const { title, body, snippetLines } = CARD_TEXT_LIMITS.concept;
/** A snippet of `lines` code lines. */
const snippetOf = (lines: number) =>
  Array.from({ length: lines }, () => 'note("<c3 e3 g3 b3>")').join('\n');
/** A concept at its text limits (its body `bodyChars` long) with `snippet` and a one-line comment. */
const maximal = (snippet: string, bodyChars: number): ConceptCardData => ({
  ...cardsByType.concept,
  title: fill(title),
  body: fill(bodyChars),
  snippet,
  snippetComment: '// cycle 1 → c3 · 2 → e3 · 3 → g3 · 4 → b3',
  cycles: ['c3', 'e3', 'g3', 'b3'],
});

/** What is drawn under the code: the tiles, or a notice in their place. */
type Under = 'tiles' | NoticeName;

/**
 * Draws the maximal card with `lines` code lines in a Strudel set and, beside it, the Sources
 * action whose icon a card from the API has in its kicker row (the flag's icon is the same size),
 * to read its size. Returns the code lines drawn, counted as the server counts them.
 */
function renderMaximal(lines: number, bodyChars = body): number {
  const snippet = snippetOf(lines);
  const drawn = maximal(snippet, bodyChars);
  const set = makeSet(0, [drawn]);
  useFeedStore.getState().startSet({ ...set, topic: { ...set.topic, lang: 'strudel' } });
  const card = createElement(ConceptCard, {
    card: drawn,
    index: 0,
    active: false,
    onNext: jest.fn(),
  });
  render(createElement(Fragment, null, createElement(SourcesButton), card));
  return lineCount(snippet);
}

/** The height of what is drawn under the code, read from the drawn styles. */
function underHeight(under: Under): number {
  if (under === 'tiles') {
    const [first] = screen.getAllByTestId('cycle-tile');
    if (first === undefined) throw new Error('no cycle tile');
    const tile = viewStyleOf(first);
    const note = textStyleOf(screen.getByText('c3'));
    const inner = type.kicker.fontSize * NATURAL_LINE + Number(tile.gap) + Number(note.lineHeight);
    return inner + 2 * Number(tile.padding) + 2 * Number(tile.borderWidth);
  }
  return noticeHeight(under);
}

/**
 * The card's content height with `under` drawn under its `codeLines` lines of code, beside a body
 * of `bodyLines` lines.
 */
function conceptHeight(codeLines: number, under: Under, bodyLines = BODY_LINES): number {
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const content = viewStyleOf(screen.getByTestId('code-block-content'));
  const codeLine = Number(textStyleOf(screen.getByTestId('code-block-code')).lineHeight);
  const comment = Number(textStyleOf(screen.getByTestId('code-block-comment')).lineHeight);
  const block = 2 * Number(content.paddingVertical) + codeLines * codeLine + comment;
  const control = Number(viewStyleOf(screen.getByTestId('playable-code-control')).height);
  const innerGap = Number(viewStyleOf(screen.getByTestId('playable-code')).gap);
  const snippet = Math.max(block, control) + innerGap + underHeight(under);
  const text = TITLE_LINES * type.cardTitleL.lineHeight + bodyLines * type.body.lineHeight;
  return kicker + text + snippet + BUTTON_HEIGHT + (BODY_CHILDREN - 1) * space[4];
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('the playing concept card height budget', () => {
  it.each([
    { under: 'tiles', height: 542.6 },
    { under: 'unavailable', height: 516.6 },
    { under: 'error', height: 538.6 },
    { under: 'needs network', height: 494.6 },
  ] as const)('with $under under the code: $height points, inside 543.5', (budget) => {
    const codeLines = renderMaximal(snippetLines);
    if (budget.under !== 'tiles') setAudio(NOTICE_AUDIO[budget.under]);

    const sum = conceptHeight(codeLines, budget.under);

    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(screen.queryAllByTestId('cycle-tiles')).toHaveLength(budget.under === 'tiles' ? 1 : 0);
    expect(screen.queryAllByTestId('audio-notice')).toHaveLength(budget.under === 'tiles' ? 0 : 1);
    expect(sum).toBeCloseTo(budget.height, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it('limits the snippet to 3 code lines, the field the server counts by CODE_LINE_FIELDS', () => {
    expect(CODE_LINE_FIELDS.concept).toBe('snippetLines');
    expect(CARD_TEXT_LIMITS.concept[CODE_LINE_FIELDS.concept]).toBe(3);
  });

  it.each([
    { name: 'one more code line', lines: snippetLines + 1, height: 564.6 },
    { name: `the stored cards' ${String(STORED_LINES)} lines`, lines: STORED_LINES, height: 652.6 },
  ])('with the tiles, $name is over the frame: $height points', (row) => {
    const codeLines = renderMaximal(row.lines);

    const sum = conceptHeight(codeLines, 'tiles');

    expect(codeLines).toBe(row.lines);
    expect(sum).toBeCloseTo(row.height, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });
});

describe('the snippet a shorter body allows (T22)', () => {
  it.each([
    { bodyChars: 49, lines: 8, height: 537.6 },
    { bodyChars: 92, lines: 7, height: 538.6 },
    { bodyChars: 135, lines: 6, height: 539.6 },
    { bodyChars: 178, lines: 5, height: 540.6 },
    { bodyChars: 221, lines: 4, height: 541.6 },
  ])(
    'a body of $bodyChars characters beside $lines code lines is $height points, inside 543.5',
    (row) => {
      const codeLines = renderMaximal(row.lines, row.bodyChars);

      const sum = conceptHeight(codeLines, 'tiles', bodyLinesOf(row.bodyChars));

      expect(bodyLinesOf(row.bodyChars)).toBe(9 - row.lines);
      expect(sum).toBeCloseTo(row.height, 5);
      expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
    },
  );

  it.each([
    { bodyChars: 50, lines: 8, height: 560.6 },
    { bodyChars: 93, lines: 7, height: 561.6 },
    { bodyChars: 136, lines: 6, height: 562.6 },
    { bodyChars: 179, lines: 5, height: 563.6 },
    { bodyChars: 222, lines: 4, height: 564.6 },
  ])(
    'one character more, $bodyChars, beside $lines code lines is $height points, over the frame',
    (row) => {
      const codeLines = renderMaximal(row.lines, row.bodyChars);

      const sum = conceptHeight(codeLines, 'tiles', bodyLinesOf(row.bodyChars));

      expect(sum).toBeCloseTo(row.height, 5);
      expect(sum).toBeGreaterThan(CONTENT_BOX);
    },
  );
});

describe('lineCount', () => {
  it.each([
    { name: 'one line', code: 'a', lines: 1 },
    { name: 'two lines', code: 'a\nb', lines: 2 },
    { name: 'a trailing break', code: 'a\n', lines: 2 },
    { name: 'no code', code: '', lines: 0 },
  ])('counts $lines for $name', ({ code, lines }) => {
    expect(lineCount(code)).toBe(lines);
  });
});
