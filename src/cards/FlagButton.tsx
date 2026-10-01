/**
 * The flag action in a card frame's corner (M6 plan, Task 3): a small flag icon that opens a
 * sheet of four reasons (`FlagSheet`). A reason closes the sheet, sends the flag once through the
 * data boundary (`flagCard` of src/data, `POST /cards/{id}/flag`) and has the frame show a fixed
 * thank-you line, whatever the API answers: a flag is fire-and-forget, never queued or retried,
 * and a failure is logged by its kind only.
 *
 * Which card a frame holds comes from `FlagTarget`, which the feed screen puts around each card it
 * draws: its server id, or none for a checkpoint (whose id is a milestone's) or a card without
 * one. A frame with no target (the Summary), or the demo sets (no API: `flagCard` is null), shows
 * no action.
 */
import { Flag } from 'lucide-react-native';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ApiError } from '../api/errors';
import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import { flagCard, type Card, type FlagReason, type FlagSender } from '../data';
import { logWarning } from '../log';
import { FlagSheet } from './FlagSheet';

/** How long the thank-you line shows. */
const THANKS_MS = 3000;
/** The icon's size: small, beside the kicker's 10-point text. */
const ICON_SIZE = 14;
/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;

const FlagTargetContext = createContext<string | null>(null);

/** Names the card a frame inside it holds, for its flag action (module comment). */
export function FlagTarget({ card, children }: { card: Card; children: ReactNode }) {
  const target = card.type === 'checkpoint' ? null : (card.id ?? null);
  return <FlagTargetContext.Provider value={target}>{children}</FlagTargetContext.Provider>;
}

/** Whether a frame here shows a flag action: it holds a card with a server id, and the app has
 * an API to send to (`send`, the data boundary's `flagCard` unless a test passes its own). */
export function useFlaggable(send: FlagSender | null = flagCard): boolean {
  return useContext(FlagTargetContext) !== null && send !== null;
}

/** Whether the thank-you line shows, and the function that shows it for `THANKS_MS`. */
export function useThanksLine(): [boolean, () => void] {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const show = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setVisible(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setVisible(false);
    }, THANKS_MS);
  };
  return [visible, show];
}

type FlagButtonProps = {
  /** Called once a reason is chosen, before the API answers: the frame shows its thanks. */
  onFlagged: () => void;
  /** Sends the flag; the data boundary's `flagCard` (null with the demo sets) unless a test
   * passes its own. */
  send?: FlagSender | null;
};

/** The flag icon button and its sheet, or nothing (module comment). */
export function FlagButton({ onFlagged, send = flagCard }: FlagButtonProps) {
  const cardId = useContext(FlagTargetContext);
  const color = useCardTextColor();
  const [open, setOpen] = useState(false);
  if (cardId === null || send === null) return null;

  const choose = (reason: FlagReason) => {
    setOpen(false);
    onFlagged();
    send(cardId, reason).catch((error: unknown) => {
      logWarning('flag_failed', { kind: error instanceof ApiError ? error.kind : 'unknown' });
    });
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.flag.action}
        hitSlop={HIT_SLOP}
        onPress={() => {
          setOpen(true);
        }}
        style={styles.button}
      >
        <Flag size={ICON_SIZE} color={color} />
      </Pressable>
      <FlagSheet
        visible={open}
        onChoose={choose}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
