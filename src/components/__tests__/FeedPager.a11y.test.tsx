import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { calls, HIDDEN, pageText, renderPager, settle } from '../testing/pager';
import type { Calls } from '../testing/pager';

// React Native's Jest preset makes every `AccessibilityInfo` call a `jest.fn`
// (@react-native/jest-preset/jest/mocks/AccessibilityInfo.js). The tests drive those.
// `addEventListener` is a method, so it is read through `accessibility` each time, not held apart.
const accessibility = jest.mocked(AccessibilityInfo);
const isScreenReaderEnabled = jest.mocked(AccessibilityInfo.isScreenReaderEnabled);
const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);

/** `addEventListener` is overloaded, so its recorded calls are read as plain values and checked. */
function isScreenReaderListener(value: unknown): value is (enabled: boolean) => void {
  return typeof value === 'function';
}
function hasMockRemove(value: unknown): value is { remove: jest.Mock } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'remove' in value &&
    jest.isMockFunction(value.remove)
  );
}

/** Tells the pager's listener that the screen reader was turned on or off. */
function screenReaderChanged(enabled: boolean): void {
  const recorded: readonly unknown[][] = accessibility.addEventListener.mock.calls;
  const handler = recorded.find(([name]) => name === 'screenReaderChanged')?.[1];
  if (!isScreenReaderListener(handler)) throw new Error('No screen reader listener');
  act(() => {
    handler(enabled);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  accessibility.addEventListener.mockClear();
  sendEvent.mockClear();
  isScreenReaderEnabled.mockResolvedValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

const position = () => screen.getByTestId('feed-pager-position');

function adjust(actionName: string): void {
  fireEvent(position(), 'accessibilityAction', { nativeEvent: { actionName } });
}

describe('FeedPager position control', () => {
  it.each([
    { index: 0, label: 'Card 1 of 7' },
    { index: 3, label: 'Card 4 of 7' },
  ])('is an adjustable element labelled "$label" on page $index', async ({ index, label }) => {
    await renderPager({ index });

    expect(position().props).toMatchObject({
      accessible: true,
      accessibilityRole: 'adjustable',
      accessibilityLabel: label,
      accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    });
    expect(screen.getByLabelText(label)).toBe(position());
  });

  it('comes first in reading order, in the top page padding, over the pages', async () => {
    await renderPager();

    const pager = screen.getByTestId('feed-pager');
    const [first] = pager.children.filter((child) => typeof child !== 'string');
    expect(typeof first === 'object' ? first.props.testID : null).toBe('feed-pager-position');
    expect(position().props.style).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 6,
    });
  });

  it('leaves the pager container without actions of its own', async () => {
    await renderPager();

    expect(screen.getByTestId('feed-pager').props).not.toHaveProperty('accessibilityActions');
    expect(screen.getByTestId('feed-pager').props).not.toHaveProperty('onAccessibilityAction');
  });
});

describe('FeedPager position control actions', () => {
  // Rows: `at` is the index, `ok` is canAdvance.
  it.each<{ row: string; action: string; at: number; ok: boolean } & Calls>([
    {
      row: 'increment, answered: next',
      action: 'increment',
      at: 2,
      ok: true,
      asked: [3],
      blocked: 0,
    },
    {
      row: 'increment, unanswered: blocked',
      action: 'increment',
      at: 2,
      ok: false,
      asked: [],
      blocked: 1,
    },
    {
      row: 'increment on the last page: nothing',
      action: 'increment',
      at: 6,
      ok: true,
      asked: [],
      blocked: 0,
    },
    {
      row: 'decrement, unanswered: back',
      action: 'decrement',
      at: 2,
      ok: false,
      asked: [1],
      blocked: 0,
    },
    {
      row: 'decrement on the first page: nothing',
      action: 'decrement',
      at: 0,
      ok: true,
      asked: [],
      blocked: 0,
    },
    {
      row: 'an unknown action: nothing',
      action: 'activate',
      at: 2,
      ok: true,
      asked: [],
      blocked: 0,
    },
    { row: 'a prototype key: nothing', action: 'toString', at: 2, ok: true, asked: [], blocked: 0 },
  ])('$row', async ({ action, at, ok, asked, blocked }) => {
    const pager = await renderPager({ index: at, canAdvance: ok });

    adjust(action);

    expect(calls(pager)).toStrictEqual({ asked, blocked });
  });
});

describe('FeedPager screen reader focus', () => {
  it('moves screen-reader focus to the position control after the index changes', async () => {
    isScreenReaderEnabled.mockResolvedValue(true);
    const { rerender } = await renderPager({ index: 2 });
    expect(sendEvent).not.toHaveBeenCalled();

    await rerender({ index: 3 });

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(screen.getByLabelText('Card 4 of 7')).toBe(position());
  });

  it('does not move focus when no screen reader is on', async () => {
    const { rerender } = await renderPager({ index: 2 });

    await rerender({ index: 3 });

    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('follows the screen reader being turned on while the pager is shown', async () => {
    const { rerender } = await renderPager({ index: 2 });
    screenReaderChanged(true);

    await rerender({ index: 3 });

    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it('removes its screen-reader listener when it unmounts', async () => {
    const { unmount } = await renderPager();
    const [added] = accessibility.addEventListener.mock.calls;
    const subscription: unknown = accessibility.addEventListener.mock.results[0]?.value;
    expect(added?.[0]).toBe('screenReaderChanged');
    if (!hasMockRemove(subscription)) throw new Error('No subscription');
    expect(subscription.remove).not.toHaveBeenCalled();

    unmount();

    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });

  it('does not move focus when a re-render keeps the index', async () => {
    isScreenReaderEnabled.mockResolvedValue(true);
    const { rerender } = await renderPager({ index: 2, canAdvance: false });

    await rerender({ index: 2, canAdvance: true });
    await settle();

    expect(sendEvent).not.toHaveBeenCalled();
  });
});

describe('FeedPager screen reader state', () => {
  it('treats a failed screen-reader query as no screen reader', async () => {
    isScreenReaderEnabled.mockRejectedValue(new Error('no accessibility module'));
    const { rerender } = await renderPager({ index: 2 });

    await rerender({ index: 3 });

    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('keeps a change event over an older answer that arrives after it', async () => {
    let answer: (on: boolean) => void = () => undefined;
    isScreenReaderEnabled.mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    const { rerender } = await renderPager({ index: 2 });
    screenReaderChanged(true);
    answer(false);
    await settle();

    await rerender({ index: 3 });

    expect(sendEvent).toHaveBeenCalledTimes(1);
  });
});

describe('FeedPager pages and screen readers', () => {
  it('hides every page but the current one', async () => {
    await renderPager({ index: 2 });

    for (let page = 0; page < 7; page += 1) {
      const current = page === 2;
      expect(screen.getByTestId(`feed-page-${String(page)}`, HIDDEN).props).toMatchObject({
        accessibilityElementsHidden: !current,
        importantForAccessibility: current ? 'auto' : 'no-hide-descendants',
      });
    }
    expect(screen.getByText(pageText(2))).toBeOnTheScreen();
    expect(screen.queryByText(pageText(3))).toBeNull();
  });
});
