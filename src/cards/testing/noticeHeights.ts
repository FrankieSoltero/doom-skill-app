/**
 * Test support for the height tests of the cards that play their code (M9 plan I): the audio state
 * that brings each notice, and the height the drawn notice takes, read from its styles. Draw the
 * card with the Strudel test double and set the state with `setAudio` first. It lives outside
 * `__tests__/` because Jest runs every file there as a suite.
 */
import { screen } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { setAudio } from './strudelDouble';

/** The notices a playing code block shows, by the name the height tests give them. */
export type NoticeName = 'unavailable' | 'error' | 'needs network';

/** The most lines a page's error text takes in the notice (`ResultBadge`'s `ERROR_MAX_LINES`). */
const ERROR_LINES = 3;
/** Page error text long enough to take all of the notice's lines. */
const PAGE_ERROR = 'x'.repeat(200);

/** The audio state that brings each notice. */
export const NOTICE_AUDIO: Record<NoticeName, Parameters<typeof setAudio>[0]> = {
  unavailable: { status: 'unavailable' },
  error: { error: PAGE_ERROR },
  'needs network': { playing: true, needsNetwork: true },
};

/**
 * The height of the drawn notice: the badge, and beside it Reset when the notice has one. The
 * badge is its one-line label, or for an error the label beside the page text at its most lines,
 * each line read from that text's own style.
 */
export function noticeHeight(notice: NoticeName): number {
  const label = Number(textStyleOf(screen.getByTestId('result-badge-label')).lineHeight);
  if (notice === 'needs network') return label;
  const reset = viewStyleOf(screen.getByRole('button', { name: 'Reset audio' }));
  if (notice === 'unavailable') return Math.max(label, Number(reset.minHeight));
  const messageLine = Number(textStyleOf(screen.getByText(PAGE_ERROR)).lineHeight);
  return Math.max(label, ERROR_LINES * messageLine, Number(reset.minHeight));
}
