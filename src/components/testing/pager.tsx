/**
 * Shared setup for the FeedPager tests. It lives outside `__tests__/` because Jest runs every file
 * there as a suite. Tests that use it call `jest.useFakeTimers()` in `beforeEach`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';

import { FeedPager } from '../FeedPager';

export const HIDDEN = { includeHiddenElements: true };
/** A frame and a bit: time for an immediate change to reach the animated style. */
export const FRAME = 20;
/** The theme's pager duration. */
export const TRANSITION = 520;
/** Every test pager has seven pages, as a set of six cards and the Summary does. */
const PAGE_COUNT = 7;

export type PagerOptions = { index?: number; canAdvance?: boolean; overlay?: ReactNode };

/** The text on page `page` of a test pager. */
export function pageText(page: number): string {
  return ['Page', String(page)].join(' ');
}

function pagerElement(
  { index = 2, canAdvance = true, overlay }: PagerOptions,
  callbacks: { onIndexChange: (index: number) => void; onBlocked: () => void },
) {
  const pages = Array.from({ length: PAGE_COUNT }, (_, page) => (
    <Text key={page}>{pageText(page)}</Text>
  ));
  const overlayProp = overlay === undefined ? {} : { overlay };
  return (
    <FeedPager
      pages={pages}
      index={index}
      canAdvance={canAdvance}
      {...overlayProp}
      {...callbacks}
    />
  );
}

// Captured when this module loads, before any test installs fake timers. Gesture Handler binds
// `setImmediate` when it loads, before the fake timers exist, so its deferred work runs on this
// real one.
const realSetImmediate = setImmediate;

/**
 * Runs the work the pager defers, without letting animation time pass. The worklets mock's
 * `scheduleOnRN` runs the pan's release in a microtask, which the fake timers hold. Gesture Handler
 * applies a re-rendered gesture's configuration and callbacks in a `setImmediate`
 * (GestureDetector/updateHandlers.ts, ghQueueMicrotask.ts) on the real timers.
 */
export async function settle(): Promise<void> {
  act(() => {
    jest.runAllTicks();
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
  });
}

export async function layout(height: number): Promise<void> {
  fireEvent(screen.getByTestId('feed-pager'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
  await settle();
}

/** Renders the pager, lays it out (700 points tall unless given), and returns its callbacks. */
export async function renderPager(options: PagerOptions = {}, height: number | null = 700) {
  const onIndexChange = jest.fn<undefined, [number]>();
  const onBlocked = jest.fn<undefined, []>();
  const callbacks = { onIndexChange, onBlocked };
  const view = render(pagerElement(options, callbacks));
  if (height !== null) await layout(height);
  else await settle();
  const rerender = async (next: PagerOptions) => {
    view.rerender(pagerElement(next, callbacks));
    await settle();
  };
  return { onIndexChange, onBlocked, rerender, unmount: view.unmount };
}

/** The pager's calls: the indexes it asked for, and how many times it reported a block. */
export type Calls = { asked: number[]; blocked: number };

export function calls(pager: Awaited<ReturnType<typeof renderPager>>): Calls {
  return {
    asked: pager.onIndexChange.mock.calls.map(([asked]) => asked),
    blocked: pager.onBlocked.mock.calls.length,
  };
}

export function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Drags the pan `translationY` points and lets go at `velocityY`, without settling. */
export function drag(translationY: number, velocityY = 0, end: State = State.END): void {
  act(() => {
    fireGestureHandler<PanGesture>(getByGestureTestId('feed-pager-pan'), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: translationY / 2, velocityY },
      { state: State.ACTIVE, translationY, velocityY },
      { state: end, translationY, velocityY },
    ]);
  });
}

/** Drags, lets go, and settles. */
export async function swipe(translationY: number, velocityY = 0, end: State = State.END) {
  drag(translationY, velocityY, end);
  await settle();
}

/** The vertical offset the track shows now. */
export function shownOffset(): number {
  const { transform } = getAnimatedStyle(screen.getByTestId('feed-pager-track', HIDDEN));
  const entry: unknown = Array.isArray(transform) ? transform[0] : undefined;
  if (typeof entry === 'object' && entry !== null && 'translateY' in entry) {
    if (typeof entry.translateY === 'number') return entry.translateY;
  }
  throw new Error('The track has no translateY');
}
