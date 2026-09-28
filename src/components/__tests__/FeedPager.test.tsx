import { act, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { useReducedMotion } from 'react-native-reanimated';

import { useInputFocus } from '../../feed/inputFocus';
import {
  advance,
  calls,
  drag,
  FRAME,
  HIDDEN,
  layout,
  pageText,
  renderPager,
  settle,
  shownOffset,
  swipe,
  TRANSITION,
} from '../testing/pager';
import type { Calls } from '../testing/pager';
import { viewStyleOf } from '../testing/styles';

// Reanimated's own hook, replaced so a test can turn the system's reduce-motion setting on.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual<object>('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  useInputFocus.setState(useInputFocus.getInitialState());
});

afterEach(() => {
  jest.useRealTimers();
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
  const panConfig = () => getByGestureTestId('feed-pager-pan').config;
  const setFocus = async (id: string, focused: boolean) => {
    const { inputFocused, inputBlurred } = useInputFocus.getState();
    act(() => {
      (focused ? inputFocused : inputBlurred)(id);
    });
    await settle();
  };

  it('pages on a vertical drag of 12 points and yields a sideways drag of 12 to a code block', async () => {
    await renderPager();

    expect(panConfig()).toMatchObject({
      activeOffsetYStart: -12,
      activeOffsetYEnd: 12,
      failOffsetXStart: -12,
      failOffsetXEnd: 12,
    });
  });

  it('turns the pan off while any text input has focus, and back on when none has', async () => {
    await renderPager();
    expect(panConfig().enabled).toBe(true);

    await setFocus('editor-a', true);
    await setFocus('editor-b', true);
    await setFocus('editor-a', false);
    expect(panConfig().enabled).toBe(false);

    await setFocus('editor-b', false);
    expect(panConfig().enabled).toBe(true);
  });
});

describe('FeedPager layout', () => {
  it('renders no pages before it has measured its height', async () => {
    await renderPager({}, null);
    expect(screen.queryByText(pageText(0), HIDDEN)).toBeNull();

    await layout(0);
    expect(screen.queryByText(pageText(0), HIDDEN)).toBeNull();

    await layout(700);
    expect(screen.getByText(pageText(0), HIDDEN)).toBeOnTheScreen();
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

  it('draws its first frame at the index it is given: page 3 of a 700 pager at -1998', async () => {
    await renderPager({ index: 3 });

    // No animation time has passed: this is the style the track mounted with.
    expect(shownOffset()).toBe(-1998);
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

      expect(shownOffset()).toBe(offset);
      expect(screen.getByText(pageText(current))).toBeOnTheScreen();
    },
  );
});

describe('FeedPager overlay', () => {
  it('draws the overlay inside the pager, over the pages, passing touches through', async () => {
    await renderPager({ overlay: <Text testID="overlay-content">{pageText(99)}</Text> });

    const pager = screen.getByTestId('feed-pager');
    const layer = within(pager).getByTestId('feed-pager-overlay');
    expect(within(layer).getByTestId('overlay-content')).toBeOnTheScreen();
    // Drawn after the pages, so it sits above them.
    const last = pager.children.filter((child) => typeof child !== 'string').at(-1);
    expect(typeof last === 'object' ? last.props.testID : null).toBe('feed-pager-overlay');
    expect(viewStyleOf(layer)).toMatchObject({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      pointerEvents: 'box-none',
    });
  });

  it('draws no overlay layer when none is given', async () => {
    await renderPager();

    expect(screen.queryByTestId('feed-pager-overlay', HIDDEN)).toBeNull();
  });
});

describe('FeedPager motion', () => {
  it('moves to a new index over 520 ms, well past halfway at 260 ms (ease-out)', async () => {
    const { rerender } = await renderPager({ index: 2 });

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

    await rerender({ index: 3 });
    advance(FRAME);

    expect(shownOffset()).toBe(-1998);
  });

  it('follows the finger during a drag, and springs back when the parent keeps the index', async () => {
    await renderPager({ index: 2, canAdvance: true });

    drag(-40);
    advance(FRAME);
    expect(shownOffset()).toBe(-1372);

    await settle();
    advance(TRANSITION + FRAME);
    expect(shownOffset()).toBe(-1332);
  });
});

describe('FeedPager drags', () => {
  it('starts a drag made during a transition from where the pages are, not from the new page', async () => {
    const { rerender } = await renderPager({ index: 2 });
    await rerender({ index: 3 });
    advance(100);
    const moving = shownOffset();

    drag(-40);
    advance(FRAME);

    expect(shownOffset()).toBeCloseTo(moving - 40);
  });

  it.each([
    { row: 'up from an unanswered card', at: 2, ok: false, dy: -60, offset: -1352 },
    { row: 'down from the first page', at: 0, ok: true, dy: 60, offset: 20 },
  ])('resists a drag $row, a third as far', async ({ at, ok, dy, offset }) => {
    await renderPager({ index: at, canAdvance: ok });

    drag(dy);
    advance(FRAME);

    expect(shownOffset()).toBeCloseTo(offset);
  });

  it('springs back at once under reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await renderPager({ index: 2, canAdvance: false });

    await swipe(-80);
    advance(FRAME);

    expect(shownOffset()).toBe(-1332);
  });
});
