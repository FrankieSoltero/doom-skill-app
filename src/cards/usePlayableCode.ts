// The logic of a code block that plays its Strudel code (M9 plan I Task 3): its player, Play and
// Stop, stopping when the card is left, and the concept card's autoplay. `PlayableCode` draws it.
import { useEffect, useRef } from 'react';

import { useStrudel, type PlayerOwner, type Strudel } from '../strudel/useStrudel';
import { useScreenShown } from './useScreenShown';
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
 * With `autoplay`, the code plays by itself once per visit (decision X2). A visit is a period in
 * which the card is shown: it is active, its screen is focused and the app is not in the
 * background (`useScreenShown`; `inactive` counts as shown). The code starts when the card is
 * shown and the player is ready with no error (as the Play control needs), whichever comes last.
 * The card stopping being shown (another page, another screen, the app in the background) ends the
 * visit and arms it again, so a return plays again. Within a visit it starts at most once: not
 * again after the learner taps Stop, nor after the player is reset and is ready again (the learner
 * taps Play then). An error does not use the start up: when Reset clears an error that kept the
 * code from starting, the code starts once the player is ready again. The flag is a ref, read and
 * written in the effect only.
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
  const screenShown = useScreenShown();
  const shown = active && screenShown;
  const startedThisVisit = useRef(false);

  useEffect(() => {
    if (!shown) {
      startedThisVisit.current = false;
      return;
    }
    // As the Play control: no start while the player reports an error.
    if (autoplay && status === 'ready' && error === null && !startedThisVisit.current) {
      startedThisVisit.current = true;
      play(code);
    }
  }, [shown, autoplay, status, error, play, code]);

  const toggle = () => {
    if (strudel.playing) stop();
    else play(code);
  };
  return { strudel, playing: strudel.playing, toggle };
}
