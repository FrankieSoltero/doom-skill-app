// The height budget of a concept card that plays (M9 plan I Task 3), by the method of
// ChoiceCard.height.test.ts: a Strudel concept at its text limits, with the Play / Stop control
// beside its code and, in turn, the cycle tiles and each audio notice in their place, summed from
// the values its parts are drawn with, must fit the card's content box on the reference device.
//
// The snippet is ONE code line plus the comment line: `CARD_TEXT_LIMITS.concept` sets no limit on
// the snippet's lines, so one is the most its limits define. A longer snippet already overflows
// today, with no audio at all: an 8-line snippet (the stored Strudel cards have up to 8) under a
// body at its limit is 652.6 points. That is a known open item, not this task's to fix.
import { render, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';
import { createElement, Fragment } from 'react';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { ConceptCard as ConceptCardData } from '../../data';
import { CARD_TEXT_LIMITS } from '../../data/textLimits';
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

const fill = (length: number) => 'x'.repeat(length);
const { title, body } = CARD_TEXT_LIMITS.concept;
const MAXIMAL: ConceptCardData = {
  ...cardsByType.concept,
  title: fill(title),
  body: fill(body),
  snippet: 'note("<c3 e3 g3 b3>")',
  snippetComment: '// cycle 1 → c3 · 2 → e3 · 3 → g3 · 4 → b3',
  cycles: ['c3', 'e3', 'g3', 'b3'],
};

/** What is drawn under the code: the tiles, or a notice in their place. */
type Under = 'tiles' | NoticeName;

/**
 * Draws the maximal card in a Strudel set and, beside it, the Sources action whose icon a card
 * from the API has in its kicker row (the flag's icon is the same size), to read its size.
 */
function renderMaximal(): void {
  const set = makeSet(0, [MAXIMAL]);
  useFeedStore.getState().startSet({ ...set, topic: { ...set.topic, lang: 'strudel' } });
  const card = createElement(ConceptCard, {
    card: MAXIMAL,
    index: 0,
    active: false,
    onNext: jest.fn(),
  });
  render(createElement(Fragment, null, createElement(SourcesButton), card));
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

/** The card's content height with `under` drawn under its one line of code. */
function conceptHeight(under: Under): number {
  const icon = Number(screen.UNSAFE_getByType(BookOpen).props.size);
  const kicker = Math.max(type.kicker.fontSize * NATURAL_LINE, icon);
  const content = viewStyleOf(screen.getByTestId('code-block-content'));
  const codeLine = Number(textStyleOf(screen.getByTestId('code-block-code')).lineHeight);
  const comment = Number(textStyleOf(screen.getByTestId('code-block-comment')).lineHeight);
  const block = 2 * Number(content.paddingVertical) + codeLine + comment;
  const control = Number(viewStyleOf(screen.getByTestId('playable-code-control')).height);
  const innerGap = Number(viewStyleOf(screen.getByTestId('playable-code')).gap);
  const snippet = Math.max(block, control) + innerGap + underHeight(under);
  const text = TITLE_LINES * type.cardTitleL.lineHeight + BODY_LINES * type.body.lineHeight;
  return kicker + text + snippet + BUTTON_HEIGHT + (BODY_CHILDREN - 1) * space[4];
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  resetStrudelDouble();
  jest.mocked(useStrudel).mockImplementation(useStrudelDouble);
});

describe('the playing concept card height budget', () => {
  it.each([
    { under: 'tiles', height: 498.6 },
    { under: 'unavailable', height: 472.6 },
    { under: 'error', height: 494.6 },
    { under: 'needs network', height: 450.6 },
  ] as const)('with $under under the code: $height points, inside 543.5', (budget) => {
    renderMaximal();
    if (budget.under !== 'tiles') setAudio(NOTICE_AUDIO[budget.under]);

    const sum = conceptHeight(budget.under);

    expect(screen.getByTestId('card-frame-body').children).toHaveLength(BODY_CHILDREN);
    expect(screen.queryAllByTestId('cycle-tiles')).toHaveLength(budget.under === 'tiles' ? 1 : 0);
    expect(screen.queryAllByTestId('audio-notice')).toHaveLength(budget.under === 'tiles' ? 0 : 1);
    expect(sum).toBeCloseTo(budget.height, 5);
    expect(sum).toBeLessThanOrEqual(CONTENT_BOX);
  });
});
