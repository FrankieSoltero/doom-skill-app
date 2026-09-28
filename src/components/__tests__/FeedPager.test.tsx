import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { Text } from 'react-native';

import { useInputFocus } from '../../feed/inputFocus';
import { FeedPager } from '../FeedPager';
import { viewStyleOf } from '../testing/styles';

// Reanimated's own hook, replaced so a test can turn the system's reduce-motion setting on.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual<object>('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

const HIDDEN = { includeHiddenElements: true };
/** A frame and a bit: time for an immediate change to reach the animated style. */
const FRAME = 20;
/** The theme's pager duration, and a frame past it. */
const TRANSITION = 520;

type PagerOptions = { index?: number; canAdvance?: boolean };

function pagerProps({ index = 2, canAdvance = true }: PagerOptions) {
  const pages = Array.from({ length: 7 }, (_, page) => (
    <Text key={page}>{`Page ${String(page)}`}</Text>
  ));
  return { pages, index, canAdvance };
}

// Captured before any test installs fake timers. Gesture Handler binds `setImmediate` when it
// loads, before the fake timers exist, so its deferred work runs on this real one.
const realSetImmediate = setImmediate;

/** Renders the pager, lays it out (700 points tall unless given), and returns its callbacks. */
async function renderPager(options: PagerOptions = {}, height: number | null = 700) {
  const onIndexChange = jest.fn<undefined, [number]>();
  const onBlocked = jest.fn<undefined, []>();
  const view = render(
    <FeedPager {...pagerProps(options)} onIndexChange={onIndexChange} onBlocked={onBlocked} />,
  );
  if (height !== null) await layout(height);
  const rerender = async (next: PagerOptions) => {
    view.rerender(
      <FeedPager {...pagerProps(next)} onIndexChange={onIndexChange} onBlocked={onBlocked} />,
    );
    await settle();
  };
  return { onIndexChange, onBlocked, rerender };
}

/**
 * Runs the work the pager defers, without letting animation time pass. The worklets mock's
 * `scheduleOnRN` runs the pan's release in a microtask, which the fake timers hold. Gesture Handler
 * applies a re-rendered gesture's configuration and callbacks in a `setImmediate`
 * (GestureDetector/updateHandlers.ts, ghQueueMicrotask.ts) on the real timers.
 */
async function settle(): Promise<void> {
  act(() => {
    jest.runAllTicks();
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
  });
}

async function layout(height: number): Promise<void> {
  fireEvent(screen.getByTestId('feed-pager'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
  await settle();
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Drags the pan `translationY` points and lets go at `velocityY`, without settling. */
function drag(translationY: number, velocityY = 0, end: State = State.END): void {
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
async function swipe(translationY: number, velocityY = 0, end: State = State.END): Promise<void> {
  drag(translationY, velocityY, end);
  await settle();
}

/** The vertical offset the track shows now. */
function shownOffset(): number {
  const { transform } = getAnimatedStyle(screen.getByTestId('feed-pager-track', HIDDEN));
  const entry: unknown = Array.isArray(transform) ? transform[0] : undefined;
  if (typeof entry === 'object' && entry !== null && 'translateY' in entry) {
    if (typeof entry.translateY === 'number') return entry.translateY;
  }
  throw new Error('The track has no translateY');
}

function accessibilityAction(actionName: string): void {
  fireEvent(screen.getByTestId('feed-pager'), 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  useInputFocus.getState().setInputFocused(false);
});

afterEach(() => {
  jest.useRealTimers();
});

/** The pager's calls: the indexes it asked for, and how many times it reported a block. */
type Calls = { asked: number[]; blocked: number };
const calls = (pager: Awaited<ReturnType<typeof renderPager>>): Calls => ({
  asked: pager.onIndexChange.mock.calls.map(([asked]) => asked),
  blocked: pager.onBlocked.mock.calls.length,
});

// Table rows: `at` is the index, `ok` is canAdvance, `dy` and `vy` the drag and its velocity.
describe('FeedPager swipes', () => {
  it.each<{ row: string; at: number; ok: boolean; dy: number; vy?: number } & Calls>([
    { row: 'up, answered: next', at: 2, ok: true, dy: -80, asked: [3], blocked: 0 },
    { row: 'fast flick up: next', at: 2, ok: true, dy: -20, vy: -900, asked: [3], blocked: 0 },
    { row: 'up, unanswered: blocked', at: 2, ok: false, dy: -80, asked: [], blocked: 1 },
    { row: 'down, unanswered: back', at: 2, ok: false, dy: 80, asked: [1], blocked: 0 },
    { row: 'down on the first page: nothing', at: 0, ok: false, dy: 80, asked: [], blocked: 0 },
    { row: 'up on the last page: nothing', at: 6, ok: false, dy: -80, asked: [], blocked: 0 },
    { row: 'a small move: nothing', at: 2, ok: false, dy: -30, asked: [], blocked: 0 },
  ])('$row', async ({ at, ok, dy, vy = 0, asked, blocked }) => {
    const pager = await renderPager({ index: at, canAdvance: ok });

    await swipe(dy, vy);

    expect(calls(pager)).toStrictEqual({ asked, blocked });
  });

  it('does nothing when the gesture is cancelled', async () => {
    const pager = await renderPager({ index: 2 });

    await swipe(-80, 0, State.CANCELLED);

    expect(calls(pager)).toStrictEqual({ asked: [], blocked: 0 });
  });
});

describe('FeedPager gesture configuration', () => {
  /** The pan's configuration. RNTL and Gesture Handler type it loosely; name what is read. */
  const panConfig = () => getByGestureTestId('feed-pager-pan').config;

  it('pages on a vertical drag of 12 points and yields a sideways drag of 12 to a code block', async () => {
    await renderPager();

    expect(panConfig()).toMatchObject({
      activeOffsetYStart: -12,
      activeOffsetYEnd: 12,
      failOffsetXStart: -12,
      failOffsetXEnd: 12,
    });
  });

  it('turns the pan off while a text input has focus, and back on after', async () => {
    await renderPager();
    expect(panConfig().enabled).toBe(true);

    act(() => {
      useInputFocus.getState().setInputFocused(true);
    });
    await settle();
    expect(panConfig().enabled).toBe(false);

    act(() => {
      useInputFocus.getState().setInputFocused(false);
    });
    await settle();
    expect(panConfig().enabled).toBe(true);
  });
});

describe('FeedPager accessibility actions', () => {
  const NEXT = { name: 'nextCard', label: 'Next card' };
  const PREVIOUS = { name: 'previousCard', label: 'Previous card' };

  it.each([
    { index: 2, offered: [NEXT, PREVIOUS] },
    { index: 0, offered: [NEXT] },
    { index: 6, offered: [PREVIOUS] },
  ])('offers only the ways that exist on page $index', async ({ index, offered }) => {
    await renderPager({ index });

    const { accessibilityActions } = screen.getByTestId('feed-pager').props as {
      accessibilityActions?: unknown;
    };
    expect(accessibilityActions).toStrictEqual(offered);
  });

  it.each<{ row: string; name: string; ok: boolean } & Calls>([
    { row: 'next, answered: moves on', name: 'nextCard', ok: true, asked: [3], blocked: 0 },
    { row: 'next, unanswered: blocked', name: 'nextCard', ok: false, asked: [], blocked: 1 },
    { row: 'previous, unanswered: back', name: 'previousCard', ok: false, asked: [1], blocked: 0 },
    { row: 'an unknown action: nothing', name: 'activate', ok: false, asked: [], blocked: 0 },
    { row: 'a prototype key: nothing', name: 'toString', ok: true, asked: [], blocked: 0 },
  ])('$row', async ({ name, ok, asked, blocked }) => {
    const pager = await renderPager({ index: 2, canAdvance: ok });

    accessibilityAction(name);

    expect(calls(pager)).toStrictEqual({ asked, blocked });
  });
});

describe('FeedPager layout', () => {
  it('renders no pages before it has measured its height', async () => {
    await renderPager({}, null);
    expect(screen.queryByText('Page 0', HIDDEN)).toBeNull();

    await layout(0);
    expect(screen.queryByText('Page 0', HIDDEN)).toBeNull();

    await layout(700);
    expect(screen.getByText('Page 0', HIDDEN)).toBeOnTheScreen();
  });

  it('keeps every page mounted, each 666 tall with the page padding, README.md:38', async () => {
    await renderPager({ index: 2 });

    for (let page = 0; page < 7; page += 1) {
      expect(viewStyleOf(screen.getByTestId(`feed-page-${String(page)}`, HIDDEN))).toMatchObject({
        height: 666,
        paddingTop: 6,
        paddingRight: 22,
        paddingBottom: 14,
        paddingLeft: 16,
      });
    }
  });

  it('fills its parent and clips the pages', async () => {
    await renderPager();

    expect(viewStyleOf(screen.getByTestId('feed-pager'))).toMatchObject({
      flex: 1,
      overflow: 'hidden',
    });
  });

  it('shows the index it is given at once on first layout: page 2 of a 700 pager at -1332', async () => {
    await renderPager({ index: 2 });
    advance(FRAME);

    expect(shownOffset()).toBe(-1332);
  });

  it('jumps without animating when its height changes', async () => {
    await renderPager({ index: 2 });
    await layout(600);
    advance(FRAME);

    expect(shownOffset()).toBe(-1132);
  });

  it.each([
    { index: 9, offset: -3996, current: 6 },
    { index: -3, offset: 0, current: 0 },
  ])(
    'shows index $index, outside the pages, as page $current',
    async ({ index, offset, current }) => {
      await renderPager({ index });
      advance(FRAME);

      expect(shownOffset()).toBe(offset);
      expect(screen.getByTestId(`feed-page-${String(current)}`).props).toMatchObject({
        accessibilityElementsHidden: false,
      });
    },
  );
});

describe('FeedPager screen reader', () => {
  it('hides every page but the current one', async () => {
    await renderPager({ index: 2 });

    for (let page = 0; page < 7; page += 1) {
      const current = page === 2;
      expect(screen.getByTestId(`feed-page-${String(page)}`, HIDDEN).props).toMatchObject({
        accessibilityElementsHidden: !current,
        importantForAccessibility: current ? 'auto' : 'no-hide-descendants',
      });
    }
    expect(screen.getByText('Page 2')).toBeOnTheScreen();
    expect(screen.queryByText('Page 3')).toBeNull();
  });
});

describe('FeedPager motion', () => {
  it('moves to a new index over 520 ms, well past halfway at 260 ms (ease-out)', async () => {
    const { rerender } = await renderPager({ index: 2 });
    advance(FRAME);

    await rerender({ index: 3 });
    advance(TRANSITION / 2);
    const halfway = shownOffset();
    expect(halfway).toBeLessThan(-1332 - 666 * 0.75);
    expect(halfway).toBeGreaterThan(-1998 - 666 * 0.1);

    // Still under way at 460 ms, so the move lasts longer than that; settled a frame after 520.
    advance(TRANSITION / 2 - 60);
    expect(shownOffset()).not.toBe(-1998);
    advance(60 + FRAME);
    expect(shownOffset()).toBe(-1998);
  });

  it('moves at once when the system asks for reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { rerender } = await renderPager({ index: 2 });
    advance(FRAME);

    await rerender({ index: 3 });
    advance(FRAME);

    expect(shownOffset()).toBe(-1998);
  });

  it('follows the finger during a drag, and springs back when the parent keeps the index', async () => {
    await renderPager({ index: 2, canAdvance: true });
    advance(FRAME);

    drag(-40);
    advance(FRAME);
    expect(shownOffset()).toBe(-1372);

    await settle();
    advance(TRANSITION + FRAME);
    expect(shownOffset()).toBe(-1332);
  });

  it.each([
    { row: 'up from an unanswered card', at: 2, ok: false, dy: -60, offset: -1352 },
    { row: 'down from the first page', at: 0, ok: true, dy: 60, offset: 20 },
  ])('resists a drag $row, a third as far', async ({ at, ok, dy, offset }) => {
    await renderPager({ index: at, canAdvance: ok });
    advance(FRAME);

    drag(dy);
    advance(FRAME);

    expect(shownOffset()).toBeCloseTo(offset);
  });

  it('springs back at once under reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await renderPager({ index: 2, canAdvance: false });
    advance(FRAME);

    await swipe(-80);
    advance(FRAME);

    expect(shownOffset()).toBe(-1332);
  });
});
