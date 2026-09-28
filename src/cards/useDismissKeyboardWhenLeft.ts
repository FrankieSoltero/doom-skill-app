import { useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';

/**
 * Dismisses the keyboard when a card with an editor stops being the current page, which blurs the
 * editor, so the pager's swipe is not left off on the next card. Only on that change: a card drawn
 * off the current page, or arriving on it, leaves the keyboard alone.
 */
export function useDismissKeyboardWhenLeft(active: boolean): void {
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) Keyboard.dismiss();
    wasActive.current = active;
  }, [active]);
}
