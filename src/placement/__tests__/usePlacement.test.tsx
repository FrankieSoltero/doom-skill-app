// The placement quiz's card steps (src/placement/usePlacement.ts) over plain placement calls: a
// double tap answers one card (M8 final review, M4), and VoiceOver hears each new card's progress
// line (M5). The screen itself is tested in app/topic/__tests__/placement.test.tsx.
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { queryWrapper } from '../../api/testing/fakeApi';
import type { Placement, PlacementQuiz } from '../../data';
import { PICK_GUARD_MS, usePlacement } from '../usePlacement';

const accessibility = jest.mocked(AccessibilityInfo);

const QUIZ: PlacementQuiz = {
  bands: [
    { milestone: 1, title: 'First sounds' },
    { milestone: 2, title: 'Mini-notation' },
  ],
  cards: ['00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602'].map(
    (id, at) => ({
      id,
      type: 'quiz' as const,
      milestone: at + 1,
      bandIndex: at,
      title: `Question ${String(at + 1)}`,
      prompt: null,
      options: ['a', 'b', 'c'],
    }),
  ),
};

beforeEach(() => {
  jest.useFakeTimers();
  accessibility.announceForAccessibility.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The hook over a quiz of two cards, started; and its send call. */
async function started() {
  const send = jest.fn<ReturnType<Placement['send']>, Parameters<Placement['send']>>();
  send.mockResolvedValue({
    kind: 'result',
    result: { placed: 0, bands: 2, knownNodes: 0, milestoneTitle: null },
  });
  const calls: Placement = {
    load: jest
      .fn<ReturnType<Placement['load']>, []>()
      .mockResolvedValue({ kind: 'quiz', quiz: QUIZ }),
    send,
    reset: jest.fn<ReturnType<Placement['reset']>, []>(),
  };
  const view = renderHook(() => usePlacement('strudel', calls, jest.fn()), {
    wrapper: queryWrapper().wrapper,
  });
  await act(() => jest.advanceTimersByTimeAsync(0));
  act(() => {
    view.result.current.start();
  });
  return { view, send };
}

async function wait(ms: number) {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

describe('usePlacement: double taps', () => {
  it('ignores a pick within the guard after a card appears', async () => {
    const { view, send } = await started();
    await wait(PICK_GUARD_MS);
    act(() => {
      view.result.current.pick(1);
    });
    // The second tap of a double tap lands on the next card at once, then once more just inside
    // the guard: both are ignored.
    act(() => {
      view.result.current.pick(2);
    });
    await wait(PICK_GUARD_MS - 1);
    act(() => {
      view.result.current.pick(2);
    });

    expect(view.result.current.step).toMatchObject({ kind: 'card', index: 1 });
    expect(send).not.toHaveBeenCalled();
    await wait(1);
    await act(async () => {
      view.result.current.pick(0);
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [cardOne, cardTwo] = QUIZ.cards.map((card) => card.id);
    expect(send).toHaveBeenCalledWith('strudel', {
      answers: [
        { cardId: cardOne, choice: 1 },
        { cardId: cardTwo, choice: 0 },
      ],
    });
  });
});

describe('usePlacement: screen readers', () => {
  it("announces each card's progress line when the card appears", async () => {
    const { view } = await started();

    expect(accessibility.announceForAccessibility.mock.calls).toStrictEqual([['1 of 2']]);
    await wait(PICK_GUARD_MS);
    act(() => {
      view.result.current.pick(1);
    });

    expect(accessibility.announceForAccessibility.mock.calls).toStrictEqual([
      ['1 of 2'],
      ['2 of 2'],
    ]);
  });
});
