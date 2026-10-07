// Whether the app is in the foreground (M10 plan Q decision Q12): the inbox polls only then. Read
// from React Native's `AppState`, not TanStack Query's `focusManager`.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * True while the app is `active`, following `AppState`'s `change` events. `inactive` (Control
 * Center, the app switcher's peek, a call banner) and `background` both read as not active. The
 * value starts from `AppState.currentState`, so a hook that mounts in the background starts false.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);
  return active;
}
