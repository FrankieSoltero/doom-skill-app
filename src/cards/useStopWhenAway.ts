// Stops a card's audio when the learner can no longer hear it on purpose: the card is not the
// current page, its screen is not the one shown, or the app is in the background.
import { NavigationContext } from 'expo-router/react-navigation';
import { use, useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

type StopWhenAwayOptions = {
  /** True while the card's page is the current one. */
  active: boolean;
  /** Stops playback. Called once for each time the card is left; it must be safe to repeat. */
  stop: () => void;
};

/**
 * Calls `stop` when the card is drawn or becomes not active, when its screen loses focus (the Today
 * tab stays mounted while another tab shows), and when the app goes to the background. The app
 * turning `inactive` (Control Center, the app switcher's peek, a call banner) does not stop it: the
 * learner may be changing the volume.
 *
 * The listeners are added once and call the latest `stop` (`useEffectEvent`), so a caller may pass
 * a new function on every render without resubscribing or stopping again.
 *
 * The screen part listens for the navigation `blur` event, as Expo Router's `useFocusEffect` does
 * for its cleanup. It reads the screen's navigation from context instead of calling that hook,
 * which throws outside a navigator: tests that draw a card or the feed on its own have no
 * navigator, and there no screen can lose focus.
 */
export function useStopWhenAway({ active, stop }: StopWhenAwayOptions): void {
  const navigation = use(NavigationContext);
  const stopNow = useEffectEvent(stop);

  useEffect(() => {
    if (!active) stopNow();
  }, [active]);

  useEffect(
    () =>
      navigation?.addListener('blur', () => {
        stopNow();
      }),
    [navigation],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') stopNow();
    });
    return () => {
      subscription.remove();
    };
  }, []);
}
