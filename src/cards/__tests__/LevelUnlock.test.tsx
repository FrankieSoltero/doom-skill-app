// The unlock moment under a passed checkpoint (src/cards/LevelUnlock.tsx, M10 plan L, L17, L21):
// the level finished and its points, then by `next` one line; for `enrolled`, the way into the
// next level, which the checkpoint card's own button takes. For `choose` (M11 plan Task 21,
// decision M21): the level-2 projects to pick from, over the real API client and a fake network.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Text } from 'react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { advance } from '../../components/testing/screen';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { switchTo } from '../../feed/useActiveTopic';
import type { LevelOutcome } from '../../feed/useCheckpointResult';
import {
  CHOICE_ROW_HEIGHT,
  continueTarget,
  continueTo,
  LEVEL_UNLOCK_HEIGHT,
  LevelUnlock,
  UNLOCK_ANNOUNCE_DELAY_MS,
} from '../LevelUnlock';

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));
jest.mock('../../feed/useActiveTopic', () => ({ switchTo: jest.fn(() => Promise.resolve()) }));
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const COMPLETED = 'Level 1 complete · +100 points';
const BUILDING = "Level 2 is being built — you'll be the first in.";

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
  jest.restoreAllMocks();
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

const CHOICES = [
  {
    slug: 'strudel-level-2-1',
    title: 'Drum machine',
    style: 'techno',
    brief: 'A kit, step by step.',
  },
  { slug: 'strudel-level-2-2', title: 'Ambient pad', style: 'ambient', brief: 'A slow drone.' },
  { slug: 'strudel-level-2-3', title: 'Break remix', style: 'jungle', brief: 'Chop a break.' },
];
const ROUTE = 'POST /topics/strudel-level-2-2/choose';
const choosing = (overrides: Partial<LevelOutcome> = {}) =>
  outcome({ next: 'choose', next_slug: null, choices: CHOICES, ...overrides });

/** Fake timers and a signed-in learner, for the choice's cases. */
function signIn(): void {
  jest.useFakeTimers();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
}

/** Draws the unlock for `level` in a query cache, the choice answering `answer`. */
function renderChoice(level: LevelOutcome, answer: Answer, choicesLater = false) {
  const requests = serveApi({ [ROUTE]: [answer] });
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <LevelUnlock outcome={level} choicesLater={choicesLater} />
    </Cache>,
  );
  return requests;
}

/** Presses the second project and lets the choice answer. */
async function pickSecond() {
  fireEvent.press(screen.getByRole('button', { name: 'Ambient pad · ambient' }));
  await advance(0);
}

describe('LevelUnlock: the level-2 projects (M11 plan Task 21; decision M21)', () => {
  beforeEach(signIn);

  it('heads the projects and draws one row each: its title and style, its brief on one line', () => {
    renderChoice(choosing(), json(200, { next: 'building', slug: 'strudel-level-2-2' }));

    expect(texts().slice(0, 4)).toStrictEqual([
      COMPLETED,
      'Choose your Level 2 project',
      'Drum machine · techno',
      'A kit, step by step.',
    ]);
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.props.accessibilityLabel as string)).toStrictEqual([
      'Drum machine · techno',
      'Ambient pad · ambient',
      'Break remix · jungle',
    ]);
    expect(screen.getByText('A slow drone.').props.numberOfLines).toBe(1);
    for (const row of rows) {
      expect(viewStyleOf(row).height).toBe(CHOICE_ROW_HEIGHT);
      expect(CHOICE_ROW_HEIGHT).toBeGreaterThanOrEqual(44);
    }
  });

  it('no projects yet: they are being drafted, then, after the asks, picked later', () => {
    const drafting = choosing({ choices: [] });
    renderChoice(drafting, json(200, {}));
    expect(texts()).toStrictEqual([COMPLETED, 'Drafting your Level 2 projects…']);

    renderChoice(drafting, json(200, {}), true);
    expect(texts()).toStrictEqual([COMPLETED, 'Pick your Level 2 project on the topic screen.']);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is at most LEVEL_UNLOCK_HEIGHT and three rows tall with three projects', () => {
    renderChoice(choosing(), json(200, {}));
    const line = Number(textStyleOf(screen.getByText(COMPLETED)).lineHeight);
    const gap = Number(viewStyleOf(screen.getByTestId('level-unlock')).gap);
    const prompt = screen.getByText('Choose your Level 2 project');
    const rows = screen
      .getAllByRole('button')
      .reduce((sum, row) => sum + Number(viewStyleOf(row).height), 0);
    const drawn = line + gap + Number(prompt.props.numberOfLines) * line + gap + rows;

    expect(prompt.props.numberOfLines).toBe(1);
    expect(screen.getByTestId('choice-rows').props.style).toBeUndefined();
    expect(drawn).toBeCloseTo(200.8, 5);
    expect(drawn).toBeLessThanOrEqual(LEVEL_UNLOCK_HEIGHT + 3 * CHOICE_ROW_HEIGHT);
  });
});

describe('LevelUnlock: choosing a project (M11 plan Task 21; decision M21)', () => {
  beforeEach(signIn);

  it.each([
    ['building', "Level 2 is being built — you'll be the first in."],
    ['waiting', 'Level 2 is nearly ready.'],
    ['failed', "Level 2 couldn't be built."],
  ] as const)(
    'a press chooses the project; %s: its line in place of the rows',
    async (next, line) => {
      const requests = renderChoice(choosing(), json(200, { next, slug: 'strudel-level-2-2' }));

      await pickSecond();

      expect(requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([ROUTE]);
      expect(texts()).toStrictEqual([COMPLETED, line]);
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('enrolled: the way into the chosen level, which continues to it', async () => {
    renderChoice(choosing(), json(200, { next: 'enrolled', slug: 'strudel-level-2-2' }));
    await pickSecond();

    fireEvent.press(screen.getByRole('button', { name: 'Continue to Level 2' }));

    expect(switchTo).toHaveBeenCalledWith('strudel-level-2-2');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('a 409 (another project chosen): says so in place of the rows', async () => {
    renderChoice(choosing(), json(409, { detail: 'Variant chosen' }));

    await pickSecond();

    expect(texts()).toStrictEqual([COMPLETED, 'You picked another project for this level.']);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a failed choice: says so in place of the heading and keeps the rows to try again', async () => {
    renderChoice(choosing(), json(503, { detail: 'Service unavailable' }));

    await pickSecond();

    expect(texts().slice(0, 2)).toStrictEqual([COMPLETED, "Couldn't start this topic. Try again."]);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('greys the rows while a choice is in flight', async () => {
    renderChoice(choosing(), new Promise<Response>(() => undefined));

    await pickSecond();

    for (const row of screen.getAllByRole('button')) expect(row).toBeDisabled();
  });
});

describe('LevelUnlock: what a choice did is announced (final review: iOS has no live region)', () => {
  beforeEach(signIn);

  it.each([
    [json(200, { next: 'building', slug: 'strudel-level-2-2' }), BUILDING],
    [json(200, { next: 'enrolled', slug: 'strudel-level-2-2' }), 'Continue to Level 2'],
    [json(409, { detail: 'Variant chosen' }), 'You picked another project for this level.'],
    [json(503, { detail: 'Service unavailable' }), "Couldn't start this topic. Try again."],
  ])('announces the line it shows, once (%#)', async (answer, line) => {
    renderChoice(choosing(), answer);

    await pickSecond();

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(line);
  });
});
