import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import { switchTo } from '../feed/useActiveTopic';
import type { LevelOutcome } from '../feed/useCheckpointResult';
import { fonts, space, type } from '../theme';

/** The heading's lines: "Level 3 complete · +300 points" is 30 characters, about 165 points. */
const COMPLETED_LINES = 1;
/** The line about the next level's lines: the longest, `building`, is 51 characters. */
const NEXT_LINES = 2;
/** Space between the heading and the line under it. */
const GAP = space[1];
/**
 * How long the unlock waits to be announced: the server's verdict (`CheckpointFeedback`) is
 * announced as the same grade arrives, and an iOS announcement cuts off the one before it.
 */
export const UNLOCK_ANNOUNCE_DELAY_MS = 2500;

/**
 * The tallest the unlock is drawn: the heading's line, the gap, and the line about the next level
 * at its most. The checkpoint card's height budget adds it (CheckpointCard.height.test.ts).
 */
export const LEVEL_UNLOCK_HEIGHT =
  COMPLETED_LINES * type.small.lineHeight + GAP + NEXT_LINES * type.small.lineHeight;

/** The line about the next level for `next`; `null` for `enrolled` (the card's button) and none. */
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

/** The way into the next level: its button's label and its slug. */
export type ContinueTarget = { label: string; slug: string };

/**
 * The next level to continue to when the learner is enrolled in it (`next` = `enrolled`, with its
 * slug); else `null`. The checkpoint card's one button then reads "Continue to Level n" (L21).
 */
export function continueTarget(outcome: LevelOutcome): ContinueTarget | null {
  if (outcome.next !== 'enrolled' || outcome.next_slug === null) return null;
  return { label: copy.levels.continueTo(outcome.level + 1), slug: outcome.next_slug };
}

/** Opens `slug` in the Today feed: it becomes the active topic, and this screen closes to it. */
export function continueTo(slug: string): void {
  void switchTo(slug);
  router.dismissTo('/');
}

/**
 * The unlock moment under a passed checkpoint (M10 plan L, L17, L21): the level finished and the
 * points it paid, then by `next` one line: being built, nearly ready, the deepest for now, or
 * couldn't be built. For `enrolled` the way on is the card's own button (`continueTarget`). It
 * sits in a polite live region and is announced once, `UNLOCK_ANNOUNCE_DELAY_MS` after it
 * appears, so the server's verdict is heard first.
 */
export function LevelUnlock({ outcome }: { outcome: LevelOutcome }) {
  const color = useCardTextColor();
  const heading = copy.levels.completed(outcome.level, outcome.points);
  const line = nextLine(outcome);
  const spoken = line === null ? heading : `${heading}. ${line}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      announce(spoken);
    }, UNLOCK_ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
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
    </View>
  );
}

const styles = StyleSheet.create({
  unlock: { gap: GAP },
  text: type.small,
  heading: { fontFamily: fonts.bodyBold },
});
