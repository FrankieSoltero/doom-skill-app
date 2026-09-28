import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { OutlineButton } from '../components/OutlineButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import { space, type } from '../theme';

/** Where loading the next set stands: the session's `nextSetStatus`. */
export type NextSetStatus = 'idle' | 'loading' | 'error' | 'none';

type SummaryActionsProps = {
  status: NextSetStatus;
  /** Loads the next set; also what Retry does. */
  onKeepGoing: () => void;
  /** Switches to the Tree tab. */
  onViewTree: () => void;
};

/** The status line for `status`, or `null` when there is none to show. */
function statusLine(status: NextSetStatus): string | null {
  if (status === 'none') return copy.thatsEverything;
  if (status === 'error') return copy.couldNotLoadMore;
  return null;
}

/** The lime button's label: Keep going, Loading… while the next set loads, Retry after a failure. */
function primaryLabel(status: NextSetStatus): string {
  if (status === 'loading') return copy.loadingMore;
  return status === 'error' ? copy.retry : copy.keepGoing;
}

/**
 * The foot of the Summary card (spec section 1a): `Keep going` (lime) over `View skill tree`
 * (outlined). While the next set loads, the lime button reads `Loading…` and is disabled. When
 * there is no next set, a line says so in its place. When the load failed, an error line sits over
 * a `Retry` button that loads again. The status line and the lime button are a polite live region
 * for Android; on iOS, which has no live regions, a change to either line is announced.
 */
export function SummaryActions({ status, onKeepGoing, onViewTree }: SummaryActionsProps) {
  const color = useCardTextColor();
  const line = statusLine(status);

  useEffect(() => {
    if (line !== null) announce(line);
  }, [line]);

  return (
    <View style={styles.actions}>
      <View testID="summary-status" accessibilityLiveRegion="polite" style={styles.actions}>
        {line === null ? null : <Text style={[styles.line, { color }]}>{line}</Text>}
        {status === 'none' ? null : (
          <PrimaryButton
            label={primaryLabel(status)}
            onPress={onKeepGoing}
            disabled={status === 'loading'}
            variant="lime"
          />
        )}
      </View>
      <OutlineButton label={copy.viewSkillTree} onPress={onViewTree} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The design has one button here; this gap between the lines and buttons is the theme's step
  // nearest the prototype's 10px list gaps (reference/LearnLoop Card Feed v2.dc.html:254).
  actions: { gap: space[3] },
  line: type.body,
});
