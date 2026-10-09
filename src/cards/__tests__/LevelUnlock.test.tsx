// The unlock moment under a passed checkpoint (src/cards/LevelUnlock.tsx, M10 plan L, L17, L21):
// the level finished and its points, then by `next` one line; for `enrolled`, the way into the
// next level, which the checkpoint card's own button takes.
import { act, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Text } from 'react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { switchTo } from '../../feed/useActiveTopic';
import type { LevelOutcome } from '../../feed/useCheckpointResult';
import {
  continueTarget,
  continueTo,
  LEVEL_UNLOCK_HEIGHT,
  LevelUnlock,
  UNLOCK_ANNOUNCE_DELAY_MS,
} from '../LevelUnlock';

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));
jest.mock('../../feed/useActiveTopic', () => ({ switchTo: jest.fn(() => Promise.resolve()) }));

const COMPLETED = 'Level 1 complete · +100 points';

const outcome = (overrides: Partial<LevelOutcome> = {}): LevelOutcome => ({
  choices: [],
  completed: true,
  level: 1,
  next: 'enrolled',
  next_slug: 'sql-level-2',
  points: 100,
  ...overrides,
});

/** Every text drawn, in order. */
const texts = () => screen.UNSAFE_queryAllByType(Text).map((t) => String(t.props.children));

const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

beforeEach(() => {
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(switchTo).mockClear();
  announce.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LevelUnlock', () => {
  it("enrolled: the points alone, and no button of its own (the card's button continues)", () => {
    render(<LevelUnlock outcome={outcome()} />);

    expect(texts()).toStrictEqual([COMPLETED]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('continueTarget: the next level and its slug when enrolled in it, else null', () => {
    expect(continueTarget(outcome())).toStrictEqual({
      label: 'Continue to Level 2',
      slug: 'sql-level-2',
    });
    expect(continueTarget(outcome({ next_slug: null }))).toBeNull();
    for (const next of ['building', 'waiting', 'deepest', 'failed', null] as const) {
      expect(continueTarget(outcome({ next, next_slug: null }))).toBeNull();
    }
  });

  it('continueTo: makes the level the active topic and closes to the Today feed', () => {
    continueTo('sql-level-2');

    expect(switchTo).toHaveBeenCalledWith('sql-level-2');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it.each([
    ['building', "Level 2 is being built — you'll be the first in."],
    ['waiting', 'Level 2 is nearly ready.'],
    ['failed', "Level 2 couldn't be built."],
  ] as const)('%s: the points, then its line about the next level', (next, line) => {
    render(<LevelUnlock outcome={outcome({ next, next_slug: null })} />);

    expect(texts()).toStrictEqual([COMPLETED, line]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("deepest: the points, then that there's no level beyond for now", () => {
    render(<LevelUnlock outcome={outcome({ level: 3, points: 300, next: 'deepest' })} />);

    expect(texts()).toStrictEqual([
      'Level 3 complete · +300 points',
      "You've reached the deepest level for now.",
    ]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the points alone when nothing is said of the next level', () => {
    render(<LevelUnlock outcome={outcome({ next: null, next_slug: null })} />);

    expect(texts()).toStrictEqual([COMPLETED]);
  });

  it('shows the points it paid, +0 for a level paid before', () => {
    render(<LevelUnlock outcome={outcome({ points: 0, next: 'waiting' })} />);

    expect(texts()[0]).toBe('Level 1 complete · +0 points');
  });
});

describe('LevelUnlock: announced and measured', () => {
  it('sits in a polite live region and is announced once, after the verdict', () => {
    jest.useFakeTimers();
    const { rerender } = render(<LevelUnlock outcome={outcome({ next: 'building' })} />);
    rerender(<LevelUnlock outcome={outcome({ next: 'building' })} />);
    act(() => {
      jest.advanceTimersByTime(UNLOCK_ANNOUNCE_DELAY_MS - 1);
    });
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(screen.getByTestId('level-unlock').props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      `${COMPLETED}. Level 2 is being built — you'll be the first in.`,
    );
  });

  it('announces nothing once it is gone before its turn', () => {
    jest.useFakeTimers();
    const { unmount } = render(<LevelUnlock outcome={outcome()} />);
    unmount();
    act(() => {
      jest.advanceTimersByTime(UNLOCK_ANNOUNCE_DELAY_MS);
    });

    expect(announce).not.toHaveBeenCalled();
  });

  it('is at most LEVEL_UNLOCK_HEIGHT tall: the heading, its gap and two lines', () => {
    render(<LevelUnlock outcome={outcome({ next: 'failed' })} />);
    const heading = screen.getByText(COMPLETED);
    const next = screen.getByText("Level 2 couldn't be built.");
    const line = Number(textStyleOf(heading).lineHeight);
    const gap = Number(viewStyleOf(screen.getByTestId('level-unlock')).gap);
    const lines = Number(next.props.numberOfLines);

    expect(heading.props.numberOfLines).toBe(1);
    expect(lines).toBe(2);
    expect(line + gap + lines * Number(textStyleOf(next).lineHeight)).toBe(LEVEL_UNLOCK_HEIGHT);
    expect(LEVEL_UNLOCK_HEIGHT).toBeCloseTo(60.4, 5);
  });
});
