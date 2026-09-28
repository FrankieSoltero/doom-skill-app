// The exercise card's one message slot: the check result badge or the audio notice, whichever
// happened last. The card is too short for both.
import { useState } from 'react';

import { STRUDEL_ERROR } from '../strudel/useStrudel';
import { noticeKey, type AudioStatus } from './AudioNotice';

/**
 * Whether Check or an edit may clear `error`: any error but a silent page's, which, like an
 * unavailable player, goes away only through Reset or a new page.
 */
export function isClearableError(error: string | null): boolean {
  return error !== null && error !== STRUDEL_ERROR.pageSilent;
}

/** The notice key `audio` will have once Check has cleared the error it may clear. */
function keyAfterCheck(audio: AudioStatus): string | null {
  return noticeKey(isClearableError(audio.error) ? { ...audio, error: null } : audio);
}

/**
 * Which message the slot holds. Check puts the result badge there (`checked`), whatever notice
 * shows. A change of notice (one appearing, or a different one) puts the notice there; a notice
 * going away leaves the badge. An edit clears the result, so the notice shows again if it still
 * holds. On mount a notice wins over a stored result: the audio state is the newer event for a
 * fresh card. `badgeShown` is true when the slot holds the badge and there is a result.
 */
export function useMessageSlot(audio: AudioStatus, hasResult: boolean) {
  const key = noticeKey(audio);
  // `key` is the notice the slot last saw; `badge` is whether Check has claimed the slot over it.
  const [slot, setSlot] = useState({ key, badge: false });
  if (slot.key !== key) {
    // The notice changed: it takes the slot. Setting state while rendering re-renders at once.
    setSlot({ key, badge: false });
  }
  const badgeClaimed = slot.key === key && slot.badge;

  return {
    badgeShown: hasResult && (key === null || badgeClaimed),
    checked: () => {
      setSlot({ key: keyAfterCheck(audio), badge: true });
    },
  };
}
