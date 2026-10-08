import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { BUTTON_HEIGHT, PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import { switchTo } from '../feed/useActiveTopic';
import type { LevelOutcome } from '../feed/useCheckpointResult';
import { fonts, space, type } from '../theme';

/** The heading's lines: "Level 3 complete · +300 points" is 30 characters, about 165 points. */
const COMPLETED_LINES = 1;
/** The line about the next level's lines: the longest, `building`, is 51 characters. */
const NEXT_LINES = 2;
/** Space between the heading and what follows it. */
const GAP = space[1];

/**
 * The tallest the unlock is drawn: the heading's line, the gap, then the taller of the button and
 * the line about the next level. The checkpoint card's height budget adds it
 * (CheckpointCard.height.test.ts).
 */
export const LEVEL_UNLOCK_HEIGHT =
  COMPLETED_LINES * type.small.lineHeight +
  GAP +
  Math.max(BUTTON_HEIGHT, NEXT_LINES * type.small.lineHeight);

/** The line about the next level for `next`; `null` for `enrolled` (a button) and for none. */
function nextLine(outcome: LevelOutcome): string | null {
  const n = outcome.level + 1;
  switch (outcome.next) {
    case 'building':
      return copy.levels.building(n);
    case 'waiting':
      return copy.levels.waiting(n);
    case 'deepest':
      return copy.levels.deepest;
    case 'failed':
      return copy.levels.failed(n);
    default:
      return null;
  }
}

/** Opens `slug` in the Today feed: it becomes the active topic, and this screen closes to it. */
function continueTo(slug: string): void {
  void switchTo(slug);
  router.dismissTo('/');
}

/**
 * The unlock moment under a passed checkpoint (M10 plan L, L17): the level finished and the points
 * it paid, then by `next` a "Continue to Level n" button when the learner is enrolled in the next
 * level (`enrolled`, with its slug), or one line: being built, nearly ready, the deepest for now,
 * or couldn't be built. It sits in a polite live region and is announced once when it appears.
 */
export function LevelUnlock({ outcome }: { outcome: LevelOutcome }) {
  const color = useCardTextColor();
  const heading = copy.levels.completed(outcome.level, outcome.points);
  const line = nextLine(outcome);
  const slug = outcome.next === 'enrolled' ? outcome.next_slug : null;
  const spoken = line === null ? heading : `${heading}. ${line}`;
  useEffect(() => {
    announce(spoken);
  }, [spoken]);

  return (
    <View testID="level-unlock" accessibilityLiveRegion="polite" style={styles.unlock}>
      <Text numberOfLines={COMPLETED_LINES} style={[styles.text, styles.heading, { color }]}>
        {heading}
      </Text>
      {line === null ? null : (
        <Text numberOfLines={NEXT_LINES} style={[styles.text, { color }]}>
          {line}
        </Text>
      )}
      {slug === null ? null : (
        <PrimaryButton
          label={copy.levels.continueTo(outcome.level + 1)}
          onPress={() => {
            continueTo(slug);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  unlock: { gap: GAP },
  text: type.small,
  heading: { fontFamily: fonts.bodyBold },
});
