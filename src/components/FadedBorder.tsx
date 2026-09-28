import { StyleSheet, View } from 'react-native';

import { border, colors } from '../theme';

/**
 * A 1pt paper border at `opacity`, drawn over the box of its parent, which must be positioned. It
 * holds no children, so its opacity fades only the border: the theme has no paper color at reduced
 * opacity, and a color literal is not allowed outside it (rule SS-1). It ignores touches. The
 * exercise card's frame (25%) and its Check and Reset buttons (45%) use it.
 */
export function FadedBorder({ opacity }: { opacity: number }) {
  return <View testID="faded-border" pointerEvents="none" style={[styles.faded, { opacity }]} />;
}

const styles = StyleSheet.create({
  faded: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: border.hairline,
    borderColor: colors.paper,
  },
});
