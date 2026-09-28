import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { OutlineButton } from '../components/OutlineButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import type { NextSetStatus } from '../feed/useFeedSession';
import { space, type } from '../theme';

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
 * Announces `line` on iOS when it changes to a line after mount. A Summary that mounts already
 * showing a line does not announce it: only a change is news.
 */
function useAnnounceChange(line: string | null): void {
  const last = useRef(line);
  useEffect(() => {
    if (line === last.current) return;
    last.current = line;
    if (line !== null) announce(line);
  }, [line]);
}

/**
 * The foot of the Summary card (spec section 1a): `Keep going` (lime) and `View skill tree`
 * (outlined) side by side in equal halves, so the card fits its page. While the next set loads,
 * the lime button reads `Loading…` and is disabled. After a failed load an error line sits over
 * the row and the lime button is `Retry`. When there is no next set, a line says so over the row
 * and `View skill tree` takes the whole row: the line is too wide for a half at the body size
 * (about 167 points against 149). The whole foot is a polite live region for Android; on iOS,
 * which has no live regions, a change to a status line is announced.
 */
export function SummaryActions({ status, onKeepGoing, onViewTree }: SummaryActionsProps) {
  const color = useCardTextColor();
  const line = statusLine(status);
  useAnnounceChange(line);

  return (
    <View testID="summary-status" accessibilityLiveRegion="polite" style={styles.actions}>
      {line === null ? null : (
        <Text testID="summary-status-line" style={[styles.line, { color }]}>
          {line}
        </Text>
      )}
      <View testID="summary-buttons" style={styles.row}>
        {status === 'none' ? null : (
          <View testID="summary-button-half" style={styles.half}>
            <PrimaryButton
              label={primaryLabel(status)}
              onPress={onKeepGoing}
              disabled={status === 'loading'}
              variant="lime"
            />
          </View>
        )}
        <View testID="summary-button-half" style={styles.half}>
          <OutlineButton label={copy.viewSkillTree} onPress={onViewTree} />
        </View>
      </View>
    </View>
  );
}

// The design has one button here. These gaps, between the status line and the row and between
// the two buttons, are the theme's step nearest the prototype's 10px list gaps
// (reference/LearnLoop Card Feed v2.dc.html:253).
export const ACTIONS_GAP = space[3];

const styles = StyleSheet.create({
  actions: { gap: ACTIONS_GAP },
  row: { flexDirection: 'row', gap: ACTIONS_GAP },
  half: { flex: 1 },
  line: type.body,
});
