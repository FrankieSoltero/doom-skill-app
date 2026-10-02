// The logic of a code block that plays its Strudel code (M9 plan I Task 3): its player, Play and
// Stop, stopping when the card is left, and the concept card's autoplay. `PlayableCode` draws it.
import { useEffect, useRef } from 'react';

import { useStrudel, type PlayerOwner, type Strudel } from '../strudel/useStrudel';
import { useStopWhenAway } from './useStopWhenAway';

export type PlayableCodeOptions = {
  /** The Strudel code to play. */
  code: string;
  /** The card the player belongs to, named in its log. */
  owner: PlayerOwner;
  /** True while the card's page is the current one. Leaving it stops the audio. */
  active: boolean;
  /** Plays the code by itself once per visit to the card (X2). */
  autoplay: boolean;
};

/** The card as its player names it in the log: its page, and its id when the API served it. */
export function playerOwner(card: { id?: string | undefined }, index: number): PlayerOwner {
  return card.id === undefined ? { cardIndex: index } : { cardIndex: index, cardId: card.id };
}

type PlayableCodeState = {
  /** The player, for the audio notice and the hidden WebView. */
  strudel: Strudel;
  playing: boolean;
  /** Play when stopped, Stop when playing. */
  toggle: () => void;
};

/**
 * One `useStrudel` player for `code`, stopped by `useStopWhenAway` when the card is not active,
 * its screen loses focus or the app goes to the background.
 *
 * With `autoplay`, the code plays by itself once per visit (decision X2): when the card is active
 * and the player is ready with no error (as the Play control needs), whichever comes last. Leaving
 * the card arms it again. Within a visit it does not start again: not after the learner taps Stop,
 * and not after the player is reset and is ready again (the learner taps Play then). The flag is a
 * ref, read and written in the effect only.
 */
export function usePlayableCode({
  code,
  owner,
  active,
  autoplay,
}: PlayableCodeOptions): PlayableCodeState {
  const strudel = useStrudel(owner);
  const { status, error, play, stop } = strudel;
  useStopWhenAway({ active, stop });
  const startedThisVisit = useRef(false);

  useEffect(() => {
    if (!active) {
      startedThisVisit.current = false;
      return;
    }
    // As the Play control: no start while the player reports an error.
    if (autoplay && status === 'ready' && error === null && !startedThisVisit.current) {
      startedThisVisit.current = true;
      play(code);
    }
  }, [active, autoplay, status, error, play, code]);

  const toggle = () => {
    if (strudel.playing) stop();
    else play(code);
  };
  return { strudel, playing: strudel.playing, toggle };
}
