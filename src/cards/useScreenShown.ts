// Whether a card's screen is the one the learner sees (M9 plan I final fix): its screen is focused
// and the app is not in the background. `usePlayableCode` starts the concept card's sound only then.
import { NavigationContext } from 'expo-router/react-navigation';
import { use, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * True while the card's screen is focused and the app is not in the background. The app turning
 * `inactive` (Control Center, the app switcher's peek, a call banner) still counts as shown, as
 * `useStopWhenAway`, which does not stop then, treats it.
 *
 * Focus is read as React Navigation's `useIsFocused` reads it: `isFocused()`, read again on each
 * `focus` and `blur` event, so a screen that mounts under another one (the feed remounted under
 * the topic page) starts unfocused. The navigation comes from context, as in `useStopWhenAway`:
 * outside a navigator (a card or the feed drawn on its own in a test) the screen counts as focused.
 * The app state starts from `AppState.currentState`, so a card drawn in the background starts
 * hidden.
 */
export function useScreenShown(): boolean {
  const navigation = use(NavigationContext);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offFocus = navigation?.addListener('focus', onChange);
      const offBlur = navigation?.addListener('blur', onChange);
      return () => {
        offFocus?.();
        offBlur?.();
      };
    },
    [navigation],
  );
  const isFocused = () => navigation?.isFocused() ?? true;
  const focused = useSyncExternalStore(subscribe, isFocused, isFocused);

  const [appState, setAppState] = useState(() => AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => {
      subscription.remove();
    };
  }, []);

  return focused && appState !== 'background';
}
