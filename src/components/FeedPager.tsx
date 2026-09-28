import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
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

/**
 * The position control's actions. A screen reader's adjust gestures (VoiceOver swipe up and down)
 * send increment and decrement: increment asks for the next card, decrement for the previous one.
 */
const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];
const ADJUST_INTENTS: ReadonlyMap<string, SwipeIntent> = new Map([
  ['increment', 'next'],
  ['decrement', 'back'],
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
  /**
   * Drawn over the pages, filling the pager, for the `Toast`. Only the overlay's own children take
   * touches; the rest passes through to the pages.
   */
  overlay?: ReactNode;
};

/** True while a screen reader is on, following changes. The listener goes when the pager does. */
function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // A change event is newer than the first answer, so the answer is dropped after one.
    let answered = false;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      answered = true;
      setEnabled(on);
    });
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (!answered) setEnabled(on);
      })
      .catch(() => {
        // No answer: leave it off. Focus is then not moved, which is the default behavior.
      });
    return () => {
      answered = true;
      subscription.remove();
    };
  }, []);

  return enabled;
}

/**
 * After the index changes, moves screen-reader focus to `target`, so it is not left on a page that
 * is now hidden. Only while a screen reader is on; a first render moves nothing.
 */
function useFocusAfterMove(target: RefObject<View | null>, index: number): void {
  const screenReader = useScreenReaderEnabled();
  const shownIndex = useRef(index);

  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    if (screenReader && target.current !== null) {
      AccessibilityInfo.sendAccessibilityEvent(target.current, 'focus');
    }
  }, [target, index, screenReader]);
}

/**
 * The track's offset. It starts at `target`, moves there over the pager transition, or at once on
 * a new height (rotation) or under reduced motion. `releases` re-runs it after every drag, so a
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

type PagerTrackProps = {
  pages: ReactNode[];
  place: PagerPlace;
  height: number;
  enabled: boolean;
  releases: number;
  onRelease: (translationY: number, velocityY: number) => void;
};

/**
 * The pages and the pan that drags them. It mounts only once the pager has a height, so its offset
 * starts at the current page and the first frame shows it.
 */
function PagerTrack({ pages, place, height, enabled, releases, onRelease }: PagerTrackProps) {
  const offset = usePagerOffset(offsetFor(place.index, height), height, releases);
  const dragStart = useSharedValue(0);
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  // The callbacks run on the UI thread; the release goes back to JS. A drag starts from where the
  // pages are, even mid-transition.
  const pan = Gesture.Pan()
    .withTestId('feed-pager-pan')
    .enabled(enabled)
    .activeOffsetY([-DECISION_TRAVEL, DECISION_TRAVEL])
    .failOffsetX([-DECISION_TRAVEL, DECISION_TRAVEL])
    .onStart(() => {
      cancelAnimation(offset);
      dragStart.set(offset.get());
    })
    .onUpdate((event) => {
      offset.set(dragStart.get() + dragOffset(event.translationY, place));
    })
    .onEnd((event, success) => {
      scheduleOnRN(onRelease, success ? event.translationY : 0, success ? event.velocityY : 0);
    });

  return (
    <GestureDetector gesture={pan}>
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
    </GestureDetector>
  );
}

/**
 * The feed's vertical pager, README.md:37-44: one card at a time, the next one peeking 34 points
 * up from the bottom. A pan drags the pages; on release a swipe past 50 points (or a fast flick)
 * asks for the next or previous page. The pan is off while a feed text input has focus.
 *
 * Screen readers get a position control first in reading order ("Card 3 of 7"), adjustable like a
 * page control: increment and decrement move under the same gate as a swipe. Pages other than the
 * current one are hidden from them.
 */
export function FeedPager(props: FeedPagerProps) {
  const { pages, index, canAdvance, onIndexChange, onBlocked, overlay } = props;
  const [height, setHeight] = useState(0);
  const [releases, setReleases] = useState(0);
  const inputFocused = useInputFocused();
  const positionRef = useRef<View>(null);
  const place: PagerPlace = {
    index: clampIndex(index, pages.length),
    pageCount: pages.length,
    canAdvance,
  };
  useFocusAfterMove(positionRef, place.index);

  const request = (intent: SwipeIntent) => {
    const outcome = pagerOutcome({ ...place, intent });
    if (outcome.kind === 'go') onIndexChange(outcome.index);
    if (outcome.kind === 'blocked') onBlocked();
  };
  const onRelease = (translationY: number, velocityY: number) => {
    request(swipeIntent(translationY, velocityY));
    setReleases((count) => count + 1);
  };
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setHeight(measured);
  };
  const onAdjust = (event: AccessibilityActionEvent) => {
    const intent = ADJUST_INTENTS.get(event.nativeEvent.actionName);
    if (intent !== undefined) request(intent);
  };

  return (
    <View testID="feed-pager" style={styles.pager} onLayout={onLayout}>
      <View
        ref={positionRef}
        testID="feed-pager-position"
        style={styles.position}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={copy.cardPosition(place.index + 1, place.pageCount)}
        accessibilityActions={ADJUST_ACTIONS}
        onAccessibilityAction={onAdjust}
      />
      {height > 0 ? (
        <PagerTrack
          pages={pages}
          place={place}
          height={height}
          enabled={!inputFocused}
          releases={releases}
          onRelease={onRelease}
        />
      ) : null}
      {overlay === undefined ? null : (
        <View testID="feed-pager-overlay" style={styles.overlay}>
          {overlay}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1, overflow: 'hidden' },
  page: PAGE_PADDING,
  // The position control has no look. It lies in the current page's top padding, where no card
  // content is, and is drawn under the pages. It has no touch handlers, so a finger there reaches
  // the pan as anywhere else; a screen reader still finds it because it has a size.
  position: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PAGE_PADDING.paddingTop,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'box-none',
  },
});
