/**
 * Test support for the cards that play their code in a Strudel set (M9 plan I): start a set in a
 * topic of a given language, name the languages whose sets do not play, draw a card whose active
 * flag a test changes, and tap Play then Stop. It lives outside `__tests__/` because Jest runs
 * every file there as a suite. Reset the store in `beforeEach` with
 * `useFeedStore.setState(useFeedStore.getInitialState(), true)`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { Card, FeedSet } from '../../data';
import { useFeedStore } from '../../feed/store';
import { makeSet } from '../../feed/testing/sets';
import { strudelActions } from './strudelDouble';

/** Starts a set of `cards` in a topic of `lang`; undefined leaves the field out, as an older API. */
export function startSetIn(cards: Card[], lang: FeedSet['topic']['lang']): void {
  const { topic, ...rest } = makeSet(0, cards);
  useFeedStore
    .getState()
    .startSet({ ...rest, topic: lang === undefined ? topic : { ...topic, lang } });
}

/** The topic languages whose cards do not play, each with its name for a test's title. */
export const SILENT_LANGS = [
  ['sql', 'sql'],
  ['null', null],
  ['absent (an older API)', undefined],
] as const;

/**
 * Draws the element `draw` builds for an active card. Returns a function that redraws it with
 * another active flag, as the pager does when the learner leaves the card or comes back.
 */
export function renderWithActive(draw: (active: boolean) => ReactElement) {
  const view = render(draw(true));
  return (active: boolean) => {
    view.rerender(draw(active));
  };
}

/**
 * Taps Play, then Stop, on a drawn card whose player is the Strudel test double, ready and with no
 * calls yet: Play plays `code`, Stop stops it once, and the control reads Play again.
 */
export function expectPlayThenStop(code: string): void {
  fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  expect(strudelActions.play.mock.calls).toStrictEqual([[code]]);
  fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
  expect(strudelActions.stop).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
}
