// The unlock moment under a passed checkpoint (src/cards/LevelUnlock.tsx, M10 plan L, L17): the
// level finished and its points, then by `next` a button to the next level or one line.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Text } from 'react-native';

import { BUTTON_HEIGHT } from '../../components/PrimaryButton';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { switchTo } from '../../feed/useActiveTopic';
import type { LevelOutcome } from '../../feed/useCheckpointResult';
import { LEVEL_UNLOCK_HEIGHT, LevelUnlock } from '../LevelUnlock';

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));
jest.mock('../../feed/useActiveTopic', () => ({ switchTo: jest.fn(() => Promise.resolve()) }));

const COMPLETED = 'Level 1 complete · +100 points';

const outcome = (overrides: Partial<LevelOutcome> = {}): LevelOutcome => ({
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

describe('LevelUnlock', () => {
  it('enrolled: the points, then a button that opens the next level in the Today feed', () => {
    render(<LevelUnlock outcome={outcome()} />);

    expect(texts()).toStrictEqual([COMPLETED, 'Continue to Level 2']);
    expect(switchTo).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Continue to Level 2' }));

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

  it('shows the points alone when nothing is said of the next level, or no slug to open', () => {
    const { rerender } = render(<LevelUnlock outcome={outcome({ next: null, next_slug: null })} />);
    expect(texts()).toStrictEqual([COMPLETED]);

    rerender(<LevelUnlock outcome={outcome({ next_slug: null })} />);
    expect(texts()).toStrictEqual([COMPLETED]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the points it paid, +0 for a level paid before', () => {
    render(<LevelUnlock outcome={outcome({ points: 0, next: 'waiting' })} />);

    expect(texts()[0]).toBe('Level 1 complete · +0 points');
  });

  it('sits in a polite live region and is announced once, with its line', () => {
    const { rerender } = render(<LevelUnlock outcome={outcome({ next: 'building' })} />);
    rerender(<LevelUnlock outcome={outcome({ next: 'building' })} />);

    expect(screen.getByTestId('level-unlock').props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      `${COMPLETED}. Level 2 is being built — you'll be the first in.`,
    );
  });

  it('is at most LEVEL_UNLOCK_HEIGHT tall: one line, its gap and the button', () => {
    render(<LevelUnlock outcome={outcome()} />);
    const line = Number(textStyleOf(screen.getByText(COMPLETED)).lineHeight);
    const gap = Number(viewStyleOf(screen.getByTestId('level-unlock')).gap);

    expect(screen.getByText(COMPLETED).props.numberOfLines).toBe(1);
    expect(line + gap + BUTTON_HEIGHT).toBe(LEVEL_UNLOCK_HEIGHT);
    expect(LEVEL_UNLOCK_HEIGHT).toBeCloseTo(72.4, 5);
  });

  it('a line about the next level takes at most two lines, under the button height', () => {
    render(<LevelUnlock outcome={outcome({ next: 'failed' })} />);
    const next = screen.getByText("Level 2 couldn't be built.");
    const lines = Number(next.props.numberOfLines);

    expect(lines).toBe(2);
    expect(lines * Number(textStyleOf(next).lineHeight)).toBeLessThanOrEqual(BUTTON_HEIGHT);
  });
});
