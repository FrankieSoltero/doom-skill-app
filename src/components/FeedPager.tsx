import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { copy } from '../copy';
import { useInputFocused } from '../feed/inputFocus';
import { motion } from '../theme';
import {
  clampIndex,
  dragOffset,
  offsetFor,
  pageHeight,
  pagerOutcome,
  swipeIntent,
} from './pagerMath';
import type { PagerPlace, SwipeIntent } from './pagerMath';

// Pager values from docs/design/card-feed/README.md:38-44 that the theme does not hold.
/** Page padding, README.md:38: top 6, right 22 (room for the 5-point shadow), bottom 14, left 16. */
const PAGE_PADDING = { paddingTop: 6, paddingRight: 22, paddingBottom: 14, paddingLeft: 16 };
/**
 * How far a finger travels before the pan decides. Vertical travel of 12 activates it (the sketch
 * in docs/design/card-feed/rn-effects.md:45); sideways travel of 12 fails it first, so a mostly
 * sideways drag stays with a horizontal scroll view inside a card (CodeBlock) and a drag within
 * 45 degrees of vertical pages, wherever it starts.
 */
const DECISION_TRAVEL = 12;

// The theme types the easing as a plain array; its four values are the bezier's control points.
const [X1 = 0, Y1 = 0, X2 = 1, Y2 = 1] = motion.pager.easing;
/** The page transition, README.md:41: 520 ms on the theme's pager bezier. */
const PAGER_TIMING = { duration: motion.pager.duration, easing: Easing.bezier(X1, Y1, X2, Y2) };

/** Accessibility action names. The labels a screen reader speaks come from `copy`. */
const NEXT_ACTION = 'nextCard';
const PREVIOUS_ACTION = 'previousCard';
const ACTION_INTENTS: ReadonlyMap<string, SwipeIntent> = new Map([
  [NEXT_ACTION, 'next'],
  [PREVIOUS_ACTION, 'back'],
]);

type FeedPagerProps = {
  /** Every page stays mounted, so a card keeps its state while the learner moves. */
  pages: ReactNode[];
  /** The page to show, owned by the parent. A value outside the pages shows the nearest end. */
  index: number;
  /** False while the current card is unanswered: advancing is gated, going back is not. */
  canAdvance: boolean;
  /** Asked to move to a page. The pager shows it once the parent passes it back as `index`. */
  onIndexChange: (index: number) => void;
  /** A gated advance was tried. The parent shows the toast. */
  onBlocked: () => void;
};

/** The actions a screen reader offers: only the directions that lead somewhere. */
function accessibilityActions({ index, pageCount }: PagerPlace): AccessibilityActionInfo[] {
  const actions: AccessibilityActionInfo[] = [];
  if (index < pageCount - 1) actions.push({ name: NEXT_ACTION, label: copy.nextCard });
  if (index > 0) actions.push({ name: PREVIOUS_ACTION, label: copy.previousCard });
  return actions;
}

/**
 * The track's offset. It moves to `target` over the pager transition, or at once on a new height
 * (first layout, rotation) or under reduced motion. `releases` re-runs it after every drag, so a
 * drag the parent does not turn into a new index springs back.
 */
function usePagerOffset(target: number, height: number, releases: number): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(target);
  const laidOutHeight = useRef(height);

  useEffect(() => {
    const resized = laidOutHeight.current !== height;
    laidOutHeight.current = height;
    offset.set(resized || reduceMotion ? target : withTiming(target, PAGER_TIMING));
  }, [offset, target, height, releases, reduceMotion]);

  return offset;
}

/**
 * The feed's vertical pager, README.md:37-44: one card at a time, the next one peeking 34 points
 * up from the bottom. A pan drags the pages; on release a swipe past 50 points (or a fast flick)
 * asks for the next or previous page, under the same gate as the accessibility actions. The pan
 * is off while a feed text input has focus, so the input keeps the touch.
 */
export function FeedPager({ pages, index, canAdvance, onIndexChange, onBlocked }: FeedPagerProps) {
  const [height, setHeight] = useState(0);
  const [releases, setReleases] = useState(0);
  const inputFocused = useInputFocused();
  const place: PagerPlace = {
    index: clampIndex(index, pages.length),
    pageCount: pages.length,
    canAdvance,
  };
  const rest = offsetFor(place.index, height);
  const offset = usePagerOffset(rest, height, releases);
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  const request = (intent: SwipeIntent) => {
    const outcome = pagerOutcome({ ...place, intent });
    if (outcome.kind === 'go') onIndexChange(outcome.index);
    if (outcome.kind === 'blocked') onBlocked();
  };
  const release = (translationY: number, velocityY: number) => {
    request(swipeIntent(translationY, velocityY));
    setReleases((count) => count + 1);
  };
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setHeight(measured);
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const intent = ACTION_INTENTS.get(event.nativeEvent.actionName);
    if (intent !== undefined) request(intent);
  };

  // The update and end callbacks run on the UI thread; the release goes back to JS.
  const pan = Gesture.Pan()
    .withTestId('feed-pager-pan')
    .enabled(!inputFocused)
    .activeOffsetY([-DECISION_TRAVEL, DECISION_TRAVEL])
    .failOffsetX([-DECISION_TRAVEL, DECISION_TRAVEL])
    .onUpdate((event) => {
      offset.set(rest + dragOffset(event.translationY, place));
    })
    .onEnd((event, success) => {
      scheduleOnRN(release, success ? event.translationY : 0, success ? event.velocityY : 0);
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        testID="feed-pager"
        style={styles.pager}
        onLayout={onLayout}
        accessibilityActions={accessibilityActions(place)}
        onAccessibilityAction={onAccessibilityAction}
      >
        {height > 0 ? (
          <Animated.View testID="feed-pager-track" style={trackStyle}>
            {pages.map((page, position) => {
              const current = position === place.index;
              return (
                <View
                  key={position}
                  testID={`feed-page-${String(position)}`}
                  style={[styles.page, { height: pageHeight(height) }]}
                  accessibilityElementsHidden={!current}
                  importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
                >
                  {page}
                </View>
              );
            })}
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1, overflow: 'hidden' },
  page: PAGE_PADDING,
});
