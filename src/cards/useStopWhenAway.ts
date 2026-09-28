// Stops a card's audio when the learner can no longer hear it on purpose: the card is not the
// current page, its screen is not the one shown, or the app is not in the foreground.
import { NavigationContext } from 'expo-router/react-navigation';
import { use, useEffect } from 'react';
import { AppState } from 'react-native';

type StopWhenAwayOptions = {
  /** True while the card's page is the current one. */
  active: boolean;
  /** Stops playback. Called once for each time the card is left; it must be safe to repeat. */
  stop: () => void;
};

/**
 * Calls `stop` when the card is drawn or becomes not active, when its screen loses focus (the Today
 * tab stays mounted while another tab shows), and when the app state turns anything but `active`.
 *
 * The screen part listens for the navigation `blur` event, as Expo Router's `useFocusEffect` does
 * for its cleanup. It reads the screen's navigation from context instead of calling that hook,
 * which throws outside a navigator: tests that draw a card or the feed on its own have no
 * navigator, and there no screen can lose focus.
 */
export function useStopWhenAway({ active, stop }: StopWhenAwayOptions): void {
  const navigation = use(NavigationContext);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  useEffect(
    () =>
      navigation?.addListener('blur', () => {
        stop();
      }),
    [navigation, stop],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    return () => {
      subscription.remove();
    };
  }, [stop]);
}
