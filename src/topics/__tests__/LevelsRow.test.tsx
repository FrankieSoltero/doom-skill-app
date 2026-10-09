// A topic's levels row on the topic screen (src/topics/LevelsRow.tsx; M10 plan L Task 15, decisions
// L16, L20), over the real API client and a fake network: each level's chip by its state (the
// current one, one to open, one to continue, a locked one, one being built, waiting or failed), and
// where a press goes. Then a code root's level-2 projects (M11 plan Task 21, decision M21): one chip
// per variant under the `Level 2` label, and a press that chooses one.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { components } from '../../api/schema';
import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { advance } from '../../components/testing/screen';
import { viewStyleOf } from '../../components/testing/styles';
import { activeTopic, loadActiveTopic } from '../../feed/useActiveTopic';
import { colors } from '../../theme';
import { LevelsRow } from '../LevelsRow';

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn(), push: jest.fn() } }));
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

type Level = components['schemas']['LevelSummary'];
type Status = Level['status'];

/** A level row's M11 fields: one variant, no project. */
const ONE = { variant: 1, project: null };
const ROOT: Level = { slug: 'strudel', level: 1, status: 'ready', published: true, ...ONE };
const TWO: Level = { slug: 'strudel-level-2', level: 2, status: 'ready', published: true, ...ONE };
const THREE: Level = {
  slug: 'strudel-level-3',
  level: 3,
  status: 'ready',
  published: true,
  ...ONE,
};

const enrollment = (slug: string, status: string) => ({
  topic_slug: slug,
  topic_title: slug,
  status,
  daily_minutes: 15,
  horizon_days: 14,
  progress: 0,
  started_at: '2026-09-30T12:00:00Z',
});
const enrolled = (...rows: ReturnType<typeof enrollment>[]) => json(200, { enrollments: rows });

const BUILDING = "Level 2 is being built — you'll be the first in.";
const LOCKED = 'Level 2, Finish the level below to unlock';

beforeEach(async () => {
  jest.useFakeTimers();
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(router.push).mockClear();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await AsyncStorage.clear();
  await loadActiveTopic();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Renders the row for `levels` on the screen of `current`, the enrollments answering `answer`. */
async function renderRow(
  levels: Level[],
  current: string,
  answer: Response,
  routes: Record<string, Answer[]> = {},
) {
  const requests = serveApi({ 'GET /me/enrollments': [answer], ...routes });
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <LevelsRow levels={levels} current={current} />
    </Cache>,
  );
  await advance(0);
  return requests;
}

async function makeActive(slug: string) {
  await AsyncStorage.setItem('activeTopic', JSON.stringify({ owner: 'user-1', slug }));
  await loadActiveTopic();
}

describe('LevelsRow: the chips', () => {
  it('highlights the current level and reads the learner’s enrollments', async () => {
    const requests = await renderRow([ROOT, TWO], 'strudel', enrolled());

    expect(requests.map((r) => r.path)).toStrictEqual(['/me/enrollments']);
    const current = screen.getByRole('button', { name: 'Level 1' });
    expect(current).toBeSelected();
    expect(current).not.toBeDisabled();
    expect(viewStyleOf(current)).toMatchObject({ backgroundColor: colors.yellow });
  });

  it('opens a level the learner may enter: its level below is completed', async () => {
    await renderRow([ROOT, TWO], 'strudel', enrolled(enrollment('strudel', 'completed')));

    fireEvent.press(screen.getByRole('button', { name: 'Level 2' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel-level-2' },
    });
  });

  it('opens the root from a level’s screen', async () => {
    await renderRow([ROOT, TWO], 'strudel-level-2', enrolled());

    fireEvent.press(screen.getByRole('button', { name: 'Level 1' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
  });

  it('greys a locked level: not enrolled, its level below not completed', async () => {
    await renderRow(
      [ROOT, TWO, THREE],
      'strudel',
      enrolled(enrollment('strudel', 'active'), enrollment('strudel-level-2', 'active')),
    );

    const locked = screen.getByRole('button', {
      name: 'Level 3, Finish the level below to unlock',
    });
    expect(locked).toBeDisabled();
    expect(viewStyleOf(locked)).toMatchObject({ opacity: 0.45 });
    expect(screen.getByText('Finish the level below to unlock')).toBeOnTheScreen();
    fireEvent.press(locked);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('treats enrollments it could not read as none: the level is locked', async () => {
    await renderRow([ROOT, TWO], 'strudel', json(500, {}));

    expect(screen.getByRole('button', { name: LOCKED })).toBeDisabled();
  });
});

describe('LevelsRow: the levels the learner is enrolled in', () => {
  it('continues a level the learner is enrolled in but not on: it becomes active, Today opens', async () => {
    await makeActive('strudel');
    await renderRow(
      [ROOT, TWO],
      'strudel',
      enrolled(enrollment('strudel', 'completed'), enrollment('strudel-level-2', 'active')),
    );

    fireEvent.press(screen.getByRole('button', { name: 'Continue to Level 2' }));
    await advance(0);

    expect(activeTopic()).toBe('strudel-level-2');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens, not continues, an enrolled level below the active one', async () => {
    await makeActive('strudel-level-2');
    await renderRow(
      [ROOT, TWO],
      'strudel-level-2',
      enrolled(enrollment('strudel', 'completed'), enrollment('strudel-level-2', 'active')),
    );

    expect(screen.queryByRole('button', { name: 'Continue to Level 1' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Level 1' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel' },
    });
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(activeTopic()).toBe('strudel-level-2');
  });

  it('opens, not continues, the level that is already the active topic', async () => {
    await makeActive('strudel-level-2');
    await renderRow([ROOT, TWO], 'strudel', enrolled(enrollment('strudel-level-2', 'active')));

    expect(screen.queryByRole('button', { name: 'Continue to Level 2' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Level 2' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel-level-2' },
    });
  });
});

describe('LevelsRow: levels not open yet', () => {
  it.each<{ status: Status; published: boolean; line: string }>([
    { status: 'pending', published: false, line: BUILDING },
    { status: 'ingesting', published: false, line: BUILDING },
    { status: 'synthesizing', published: false, line: BUILDING },
    { status: 'ready', published: false, line: 'Level 2 is nearly ready.' },
    { status: 'failed', published: false, line: "Level 2 couldn't be built." },
  ])('shows a $status level (published $published) as "$line", not pressable', async (row) => {
    const level = { ...TWO, status: row.status, published: row.published };
    await renderRow([ROOT, level], 'strudel', enrolled(enrollment('strudel', 'completed')));

    const chip = screen.getByRole('button', { name: row.line });
    expect(chip).toBeDisabled();
    fireEvent.press(chip);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

const variant = (n: number, title: string, row: Partial<Level> = {}): Level => ({
  slug: `strudel-level-2-${String(n)}`,
  level: 2,
  status: 'pending',
  published: false,
  variant: n,
  project: { title, style: 'techno', brief: 'A brief.' },
  ...row,
});
const DRUMS = variant(1, 'Drum machine');
const PADS = variant(2, 'Ambient pad');
const BREAKS = variant(3, 'Break remix');
const CHOOSE = 'POST /topics/strudel-level-2-2/choose';
const completedRoot = () => enrolled(enrollment('strudel', 'completed'));

describe('LevelsRow: the projects of a level 2 (M11 plan Task 21; decision M21)', () => {
  it('draws the Level 2 label and one chip per project, named by its title', async () => {
    await renderRow([ROOT, DRUMS, PADS, BREAKS], 'strudel', completedRoot());

    expect(screen.getByText('Level 2')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Level 2' })).toBeNull();
    for (const title of ['Drum machine', 'Ambient pad', 'Break remix']) {
      expect(screen.getByRole('button', { name: `${title}, Choose` })).not.toBeDisabled();
    }
  });

  it('locks a pending project while the root is not completed', async () => {
    await renderRow([ROOT, DRUMS], 'strudel', enrolled(enrollment('strudel', 'active')));

    const chip = screen.getByRole('button', {
      name: 'Drum machine, Finish the level below to unlock',
    });
    expect(chip).toBeDisabled();
  });

  it.each<{ row: Partial<Level>; line: string }>([
    { row: { status: 'ingesting' }, line: BUILDING },
    { row: { status: 'synthesizing' }, line: BUILDING },
    { row: { status: 'ready', published: false }, line: 'Level 2 is nearly ready.' },
    { row: { status: 'failed' }, line: "Level 2 couldn't be built." },
  ])('shows a $row.status project as "$line", not pressable', async ({ row, line }) => {
    await renderRow([ROOT, variant(1, 'Drum machine', row)], 'strudel', completedRoot());

    expect(screen.getByRole('button', { name: `Drum machine, ${line}` })).toBeDisabled();
  });

  it('a published project is a level as before: opened, continued or current', async () => {
    const published = (n: number, title: string) =>
      variant(n, title, { status: 'ready', published: true });
    await makeActive('strudel');
    await renderRow(
      [ROOT, published(1, 'Drum machine'), published(2, 'Ambient pad')],
      'strudel',
      enrolled(enrollment('strudel', 'completed'), enrollment('strudel-level-2-2', 'active')),
    );

    fireEvent.press(screen.getByRole('button', { name: 'Drum machine' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel-level-2-1' },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Ambient pad, Continue to Level 2' }));
    await advance(0);
    expect(activeTopic()).toBe('strudel-level-2-2');
  });

  it('opens a published level 3 once any project of level 2 is completed (L20)', async () => {
    const published = (n: number, title: string) =>
      variant(n, title, { status: 'ready', published: true });
    await renderRow(
      [ROOT, published(1, 'Drum machine'), published(2, 'Ambient pad'), THREE],
      'strudel',
      enrolled(enrollment('strudel', 'completed'), enrollment('strudel-level-2-2', 'completed')),
    );

    fireEvent.press(screen.getByRole('button', { name: 'Level 3' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'strudel-level-3' },
    });
  });

  it('marks the project on screen as the current one', async () => {
    await renderRow([ROOT, DRUMS, PADS], 'strudel-level-2-1', completedRoot());

    expect(screen.getByRole('button', { name: 'Drum machine' })).toBeSelected();
  });
});

describe('LevelsRow: choosing a project (M11 plan Task 21; decision M21)', () => {
  it('a press on a choosable project chooses it, says what it did and reads the row again', async () => {
    const requests = await renderRow([ROOT, DRUMS, PADS, BREAKS], 'strudel', completedRoot(), {
      [CHOOSE]: [json(200, { next: 'building', slug: 'strudel-level-2-2' })],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Ambient pad, Choose' }));
    await advance(0);

    expect(requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([
      'GET /me/enrollments',
      CHOOSE,
      'GET /me/enrollments',
    ]);
    expect(screen.getByText(BUILDING)).toBeOnTheScreen();
  });

  it('says another project was chosen on a 409', async () => {
    await renderRow([ROOT, DRUMS, PADS], 'strudel', completedRoot(), {
      [CHOOSE]: [json(409, { detail: 'Variant chosen' })],
    });

    fireEvent.press(screen.getByRole('button', { name: 'Ambient pad, Choose' }));
    await advance(0);

    expect(screen.getByText('You picked another project for this level.')).toBeOnTheScreen();
  });
});
