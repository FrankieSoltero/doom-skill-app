/**
 * A small icon button of a card frame that needs the API: the help action (src/cards/HelpButton.tsx)
 * and the flag action (src/cards/FlagButton.tsx). While the API cannot be reached (`useOnline`) it
 * is dimmed and disabled, with the hint "Needs a connection" (offline-topic plan O6), and ignores
 * presses.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useOnline } from '../api/useOnline';
import { copy } from '../copy';

/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;
/** A disabled icon's opacity, as a disabled button's. */
const DISABLED_OPACITY = 0.45;

type OnlineIconActionProps = {
  /** The accessibility label. */
  label: string;
  onPress: () => void;
  /** The icon. */
  children: ReactNode;
};

/** The icon button (module comment). */
export function OnlineIconAction({ label, onPress, children }: OnlineIconActionProps) {
  const online = useOnline();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={online ? undefined : copy.needsConnection}
      accessibilityState={{ disabled: !online }}
      disabled={!online}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.button, online ? null : styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: DISABLED_OPACITY },
});
