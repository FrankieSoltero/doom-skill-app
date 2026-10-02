// The height a revealed review card's code takes when it plays (M9 plan I Task 4), by the method of
// ConceptCard.height.test.ts: summed from the values its parts are drawn with. This task asserts
// only what it changes. The Play / Stop control sits beside the code, so the revealed card of a
// Strudel set is exactly as tall as the same card with today's plain code block; and each audio
// notice, while it shows, adds its own height under the code (an informational row).
//
// Open items for the owner, not this task's to fix:
// (a) The review card has no text limits: `CARD_TEXT_LIMITS` has no `review` entry, so a review
//     "at its text limits" is not defined and no full-card budget is asserted here.
// (b) A read-only estimate on the local database (2026-10-02): 44 of the 70 active code-style
//     review cards are already taller than the 543.5-point frame with no audio, up to about 846
//     (prompts to 138 characters, answers to 310, snippets to 10 lines).
// (c) With a prompt of 2 lines and one code line, an answer of 6 lines or more puts the card with an
//     audio error notice over the frame (546.0 at 6 lines).
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { FeedSet, ReviewCard as ReviewCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { useStrudel } from '../../strudel/useStrudel';
import { ReviewCard } from '../ReviewCard';
import { resetStrudelDouble, setAudio, useStrudelDouble } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const CARD: ReviewCardData = { ...cardsByType.review, snippet: 's("bd ~ sd ~")' };
/** The most lines a page's error text takes in the notice (`ResultBadge`'s `ERROR_MAX_LINES`). */
const ERROR_LINES = 3;

/** Draws CARD revealed, in a set whose topic has `lang`. */
function renderRevealedIn(lang: FeedSet['topic']['lang']): void {
  const { topic, ...rest } = makeSet(0, [CARD]);
  const store = useFeedStore.getState();
  store.startSet({ ...rest, topic: { ...topic, lang } });
  store.setAnswer(0, { kind: 'review', revealed: true, rating: null });
  render(createElement(ReviewCard, { card: CARD, index: 0, active: false, onNext: jest.fn() }));
}

/** The one-line code block's height: its padding above and below, and the code line. */
function blockHeight(): number {
  const content = viewStyleOf(screen.getByTestId('code-block-content'));
  const codeLine = Number(textStyleOf(screen.getByTestId('code-block-code')).lineHeight);
  return 2 * Number(content.paddingVertical) + codeLine;
}

/** The code row of the playing card: the block and the control side by side. */
function playableRowHeight(): number {
  const control = Number(viewStyleOf(screen.getByTestId('playable-code-control')).height);
  return Math.max(blockHeight(), control);
}

/** What a notice adds under the code row: the column's gap and the notice. */
function noticeHeight(notice: 'unavailable' | 'error' | 'needs network'): number {
  const gap = Number(viewStyleOf(screen.getByTestId('playable-code')).gap);
  const line = Number(textStyleOf(screen.getByTestId('result-badge-label')).lineHeight);
  if (notice === 'needs network') return gap + line;
  const reset = Number(viewStyleOf(screen.getByRole('button', { name: 'Reset audio' })).minHeight);
  return gap + Math.max(notice === 'error' ? ERROR_LINES * line : line, reset);
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
    { notice: 'unavailable', audio: { status: 'unavailable' as const }, added: 57.6 },
    { notice: 'error', audio: { error: 'x'.repeat(200) }, added: 79.6 },
    { notice: 'needs network', audio: { playing: true, needsNetwork: true }, added: 35.6 },
  ] as const)('adds $added points under the code while "$notice" shows', (row) => {
    renderRevealedIn('strudel');
    setAudio(row.audio);

    expect(screen.getByTestId('audio-notice')).toBeOnTheScreen();
    expect(noticeHeight(row.notice)).toBeCloseTo(row.added, 5);
  });
});
