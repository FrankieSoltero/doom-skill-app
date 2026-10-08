// A topic's levels row on the topic screen (src/topics/LevelsRow.tsx; M10 plan L Task 15, decisions
// L16, L20), over the real API client and a fake network: each level's chip by its state (the
// current one, one to open, one to continue, a locked one, one being built, waiting or failed), and
// where a press goes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { components } from '../../api/schema';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
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

const ROOT: Level = { slug: 'strudel', level: 1, status: 'ready', published: true };
const TWO: Level = { slug: 'strudel-level-2', level: 2, status: 'ready', published: true };
const THREE: Level = { slug: 'strudel-level-3', level: 3, status: 'ready', published: true };

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
const LOCKED = 'Level 2, Finish the level before to unlock';

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
async function renderRow(levels: Level[], current: string, answer: Response) {
  const requests = serveApi({ 'GET /me/enrollments': [answer] });
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
      name: 'Level 3, Finish the level before to unlock',
    });
    expect(locked).toBeDisabled();
    expect(viewStyleOf(locked)).toMatchObject({ opacity: 0.45 });
    expect(screen.getByText('Finish the level before to unlock')).toBeOnTheScreen();
    fireEvent.press(locked);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('treats enrollments it could not read as none: the level is locked', async () => {
    await renderRow([ROOT, TWO], 'strudel', json(500, {}));

    expect(screen.getByRole('button', { name: LOCKED })).toBeDisabled();
  });

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
