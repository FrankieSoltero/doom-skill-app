// The height a revealed review card takes, by the method of ConceptCard.height.test.ts: summed from
// the values its parts are drawn with. M9 plan I Task 4 added the first two cases: the Play / Stop
// control sits beside the code, so the revealed card of a Strudel set is exactly as tall as the
// same card with today's plain code block; and each audio notice, while it shows, adds its own
// height under the code (an informational row).
//
// M10 plan T Task 1 adds the card's budget: `CARD_TEXT_LIMITS.review` (src/data/textLimits.ts)
// limits the prompt to 2 title lines, the answer to `ANSWER_LINES` lines and the snippet to
// `review.snippetLines` code lines, and a revealed card at those limits, in a Strudel set with the
// rating hint showing (the learner's first ratings) and each notice in turn under its code, fits
// the 543.5-point frame; one more answer line or one more code line does not. Before it, a
// read-only estimate on the local database (2026-10-02) found 44 of the 70 active code-style review
// cards taller than the frame with no audio, up to about 846 (prompts to 138 characters, answers
// to 310, snippets to 10 lines).
import { render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { copy } from '../../copy';
import type { FeedSet, ReviewCard as ReviewCardData } from '../../data';
import { CARD_TEXT_LIMITS, lineCount } from '../../data/textLimits';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { type } from '../../theme';
import { ReviewCard } from '../ReviewCard';
import { SourcesButton } from '../SourcesButton';
import { NOTICE_AUDIO, noticeHeight } from '../testing/noticeHeights';
import { resetStrudelDouble, setAudio, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

/** The lines `CARD_TEXT_LIMITS.review` was derived from: a prompt of 2, an answer of 4. */
const TITLE_LINES = 2;
const ANSWER_LINES = 4;
/** The revealed card body's children: kicker row, prompt, answer and code, spacer, rating row. */
const BODY_CHILDREN = 5;
/** The card body's content box on the 390x844 reference device (SummaryCard.height.test.ts). */
const CONTENT_BOX = 543.5;
/** A style with no line height (the kicker) takes 1.2 times its size: Barlow's `hhea` metrics. */
const NATURAL_LINE = 1.2;

/** What is drawn under the code: a notice, by its name in noticeHeights.ts, or none. */
type Under = Parameters<typeof noticeHeight>[0] | 'none';

const CARD: ReviewCardData = { ...cardsByType.review, snippet: 's("bd ~ sd ~")' };

const fill = (length: number) => 'x'.repeat(length);
/** A snippet of `lines` code lines. */
const snippetOf = (lines: number) =>
  Array.from({ length: lines }, () => 's("bd ~ sd ~")').join('\n');
const { prompt, answer, snippetLines } = CARD_TEXT_LIMITS.review;
/** A review card at its limits, with `lines` lines of code. */
const maximal = (lines: number): ReviewCardData => ({
  ...cardsByType.review,
  prompt: fill(prompt),
  answer: fill(answer),
  snippet: snippetOf(lines),
});

/**
 * Draws `card` revealed, in a set whose topic has `lang`, beside the Sources action whose icon a
 * card from the API has in its kicker row (the flag's icon is the same size), to read its size.
 */
function renderRevealedIn(lang: FeedSet['topic']['lang'], card: ReviewCardData = CARD): void {
  const { topic, ...rest } = makeSet(0, [card]);
  const store = useFeedStore.getState();
  store.startSet({ ...rest, topic: { ...topic, lang } });
  store.setAnswer(0, { kind: 'review', revealed: true, rating: null });
  const drawn = createElement(ReviewCard, { card, index: 0, active: false, onNext: jest.fn() });
  render(createElement(Fragment, null, createElement(SourcesButton), drawn));
}

/** The code block's height for `lines` code lines: its padding above and below, and the lines. */
function blockHeight(lines = 1): number {
  const content = viewStyleOf(screen.getByTestId('code-block-content'));
  const codeLine = Number(textStyleOf(screen.getByTestId('code-block-code')).lineHeight);
  return 2 * Number(content.paddingVertical) + lines * codeLine;
}

/** The code row of the playing card: the block and the control side by side. */
function playableRowHeight(lines = 1): number {
  const control = Number(viewStyleOf(screen.getByTestId('playable-code-control')).height);
  return Math.max(blockHeight(lines), control);
}

/** The style of the `BoldText` drawn first in the view `testID`: the text's own, not a span's. */
function boldTextStyle(testID: string) {
  const [text] = screen.getByTestId(testID).children;
  if (text === undefined || typeof text === 'string') throw new Error(`no text in ${testID}`);
  return textStyleOf(text);
}

/** The rating row of a revealed card: the caption, the buttons and the hint, and the gaps. */
function ratingRowHeight(): number {
  const gap = Number(viewStyleOf(screen.getByTestId('rating-row')).gap);
  const caption = Number(textStyleOf(screen.getByText(copy.howWell)).lineHeight);
  const [face] = screen.getAllByTestId('rating-face');
  if (face === undefined) throw new Error('no rating button');
  const hint = Number(textStyleOf(screen.getByTestId('rating-hint')).lineHeight);
  return caption + gap + Number(viewStyleOf(face).height) + gap + hint;
}

/**
 * The drawn card's content height with `answerLines` lines of answer, `codeLines` lines of code
 * and `under` (a notice, or none) under the code, read from the drawn styles.
 */
function reviewHeight(answerLines: number, codeLines: number, under: Under): number {
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const title = TITLE_LINES * Number(textStyleOf(screen.getByRole('header')).lineHeight);
  const card = screen.getByTestId('review-answer');
  const answerLine = Number(boldTextStyle('review-answer-text').lineHeight);
  const code = playableRowHeight(codeLines);
  const innerGap = Number(viewStyleOf(screen.getByTestId('playable-code')).gap);
  const notice = under === 'none' ? 0 : innerGap + noticeHeight(under);
  const answerPart = answerLines * answerLine + Number(viewStyleOf(card).gap) + code + notice;
  const gaps = (BODY_CHILDREN - 1) * Number(viewStyleOf(screen.getByTestId('card-frame-body')).gap);
  return kicker + title + answerPart + ratingRowHeight() + gaps;
}

/**
 * Draws a review card at its limits with `lines` code lines, revealed, in a Strudel set. Returns
 * the code lines drawn, counted as the server counts them.
 */
function renderMaximal(lines: number): number {
  const card = maximal(lines);
  renderRevealedIn('strudel', card);
  return lineCount(card.snippet);
}

beforeEach(() => {
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
});

describe('the revealed review card that plays', () => {
  it('is as tall as with the plain code block: the control adds 0', () => {
    renderRevealedIn('sql');
    const plain = blockHeight();
    expect(screen.queryByTestId('playable-code-control')).toBeNull();
    screen.unmount();

    renderRevealedIn('strudel');

    expect(screen.queryAllByTestId('audio-notice')).toHaveLength(0);
    expect(plain).toBe(50);
    expect(playableRowHeight()).toBe(plain);
  });

  it.each([
    { notice: 'unavailable', added: 57.6 },
    { notice: 'error', added: 79.6 },
    { notice: 'needs network', added: 35.6 },
  ] as const)('adds $added points under the code while "$notice" shows', (row) => {
    renderRevealedIn('strudel');
    setAudio(NOTICE_AUDIO[row.notice]);

    // The column's gap, then the notice.
    const gap = Number(viewStyleOf(screen.getByTestId('playable-code')).gap);
    expect(screen.getByTestId('audio-notice')).toBeOnTheScreen();
    expect(gap + noticeHeight(row.notice)).toBeCloseTo(row.added, 5);
  });
});

describe('the review card height budget', () => {
  it('limits the prompt to 2 title lines, the answer to 4 lines and the code to 3', () => {
    expect(CARD_TEXT_LIMITS.review).toStrictEqual({ prompt: 38, answer: 154, snippetLines: 3 });
  });

  it.each([
    { under: 'none', height: 458.4 },
    { under: 'unavailable', height: 516 },
    { under: 'error', height: 538 },
    { under: 'needs network', height: 494 },
  ] as const)('at its limits with $under under the code: $height points, inside 543.5', (row) => {
    const codeLines = renderMaximal(snippetLines);
    if (row.under !== 'none') setAudio(NOTICE_AUDIO[row.under]);

    const sum = reviewHeight(ANSWER_LINES, codeLines, row.under);

    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(screen.getByTestId('rating-hint')).toBeOnTheScreen();
    expect(sum).toBeCloseTo(row.height, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it('one more answer line, with the error notice, is over the frame: 564 points', () => {
    const codeLines = renderMaximal(snippetLines);
    setAudio(NOTICE_AUDIO.error);

    const sum = reviewHeight(ANSWER_LINES + 1, codeLines, 'error');

    expect(sum).toBeCloseTo(564, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });

  it('one more code line, with the error notice, is over the frame: 560 points', () => {
    const codeLines = renderMaximal(snippetLines + 1);
    setAudio(NOTICE_AUDIO.error);

    const sum = reviewHeight(ANSWER_LINES, codeLines, 'error');

    expect(codeLines).toBe(snippetLines + 1);
    expect(sum).toBeCloseTo(560, 5);
    expect(sum).toBeGreaterThan(CONTENT_BOX);
  });
});
