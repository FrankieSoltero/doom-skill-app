// The Explore tab's subjects with branches (app/(tabs)/explore.tsx over
// src/topics/BranchesSheet.tsx; catalog learnable-topics plan, L6): a catalog row with branches
// shows their count and a chevron; its tap opens the sheet, whose "Learn all" and branches each
// do their own row's action. A built subject keeps its branches. Over the real API client and a
// fake network; the rest of the list is in explore.suggest.test.tsx.
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Keyboard } from 'react-native';

import { json, serveApi, type Answer } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import ExploreScreen from '../explore';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const HIDDEN = { includeHiddenElements: true };
const catalogRow = (key: string, label: string, built_slug: string | null, branches = 0) => ({
  key,
  label,
  group: 'quantitative',
  kind: 'academic discipline',
  rank: 500,
  built_slug,
  branches,
});
const MATHS = catalogRow('wikidata:Q395', 'Mathematics', null, 9);
const BUILT_MATHS = { ...MATHS, built_slug: 'mathematics' };
const C = { ...catalogRow('wikidata:Q15777', 'C (programming language)', null), group: 'code' };
const ALGEBRA = catalogRow('wikidata:Q3968', 'Algebra', null, 4);
const GEOMETRY = catalogRow('wikidata:Q8087', 'Geometry', 'geometry');
const OTHERS = 'Calculus,Linear algebra,Number theory,Topology,Statistics,Logic,Analysis';
const NINE = [
  ALGEBRA,
  GEOMETRY,
  ...OTHERS.split(',').map((label, i) => catalogRow(`k${String(i)}`, label, null)),
];
const openTopic = (slug: string, title: string, status = 'ready') => ({
  slug,
  title,
  status,
  description: null,
  level: 1,
  parent_slug: null,
  levels: [{ slug, level: 1, status, published: true }],
});
/** The routes of a request for `title` that starts building it. */
const building = (slug: string, title: string) => ({
  'POST /topics': [json(202, { topic: openTopic(slug, title, 'pending'), job_id: 'job-1' })],
  'GET /jobs/job-1': [
    json(200, { id: 'job-1', kind: 'k', progress: {}, reason: null, status: 'running' }),
  ],
});
const TOP = 'GET /topics/suggest/top';
const SUGGEST = 'GET /topics/suggest';
const BRANCHES = 'GET /catalog/wikidata%3AQ395/branches';
const MATHS_ROW = 'Mathematics, quantitative, 9 branches';
const sheet = () => within(screen.getByTestId('explore-branches-sheet'));
const posts = (requests: { method: string; body?: unknown }[]) =>
  requests.filter((r) => r.method === 'POST');

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Renders the tab over `routes` (no enrollments, no slice by default) and types `text`. */
async function typeQuery(routes: Record<string, Answer[]>, text: string) {
  const requests = serveApi({
    'GET /me/enrollments': [json(200, { enrollments: [] })],
    [TOP]: [json(200, { topics: [], rows: [] })],
    ...routes,
  });
  await renderScreen(<ExploreScreen />);
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
  return requests;
}

/** Searches "math" with `subject` the one suggestion, then taps it to open its branches. */
async function openBranches(subject: object, routes: Record<string, Answer[]> = {}) {
  const requests = await typeQuery(
    {
      [SUGGEST]: [json(200, { suggestions: [subject] })],
      [BRANCHES]: [json(200, NINE)],
      ...routes,
    },
    'math',
  );
  fireEvent.press(screen.getByRole('button', { name: MATHS_ROW }));
  await advance(0);
  return requests;
}

describe('Explore: a subject with branches', () => {
  it('shows its count and a chevron in place of Build', async () => {
    await typeQuery({ [SUGGEST]: [json(200, { suggestions: [MATHS, C] })] }, 'c');

    const row = screen.getByRole('button', { name: MATHS_ROW });
    expect(within(row).getByText('9 branches')).toBeOnTheScreen();
    expect(within(row).getByTestId('explore-row-chevron', HIDDEN)).toBeOnTheScreen();
    expect(within(row).queryByText('Build')).toBeNull();
    const plain = screen.getByRole('button', { name: 'C (programming language), code, Build' });
    expect(within(plain).queryByTestId('explore-row-chevron', HIDDEN)).toBeNull();
  });

  it('opens the sheet on a tap: Learn all, the heading and its 9 branches; nothing is sent', async () => {
    const requests = await openBranches(MATHS);

    expect(sheet().getByRole('header', { name: 'Mathematics' })).toBeOnTheScreen();
    expect(sheet().getByRole('button', { name: 'Learn all of Mathematics' })).toBeOnTheScreen();
    expect(sheet().getByText('Branches')).toBeOnTheScreen();
    expect(sheet().getAllByTestId('explore-row')).toHaveLength(9);
    // A branch is a normal row: its own action, even when it has branches of its own.
    expect(sheet().getByRole('button', { name: 'Algebra, quantitative, Build' })).toBeOnTheScreen();
    expect(sheet().queryByTestId('explore-row-chevron', HIDDEN)).toBeNull();
    expect(posts(requests)).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('builds the subject on Learn all, closing the sheet for its card', async () => {
    const requests = await openBranches(MATHS, building('mathematics', 'Mathematics'));
    fireEvent.press(sheet().getByRole('button', { name: 'Learn all of Mathematics' }));
    await advance(0);

    expect(posts(requests).map((r) => r.body)).toStrictEqual([
      { query: 'Mathematics', catalog_key: 'wikidata:Q395' },
    ]);
    expect(screen.queryByTestId('explore-branches-sheet')).toBeNull();
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
  });

  it('opens a built subject’s page on Learn all', async () => {
    const requests = await openBranches(BUILT_MATHS);
    fireEvent.press(sheet().getByRole('button', { name: 'Learn all of Mathematics' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'mathematics' },
    });
    expect(posts(requests)).toHaveLength(0);
    expect(screen.queryByTestId('explore-branches-sheet')).toBeNull();
  });

  it('builds an unbuilt branch with its catalog key, closing the sheet for its card', async () => {
    const requests = await openBranches(MATHS, building('algebra', 'Algebra'));
    fireEvent.press(sheet().getByRole('button', { name: 'Algebra, quantitative, Build' }));
    await advance(0);

    expect(posts(requests).map((r) => r.body)).toStrictEqual([
      { query: 'Algebra', catalog_key: 'wikidata:Q3968' },
    ]);
    expect(screen.queryByTestId('explore-branches-sheet')).toBeNull();
    expect(screen.getByText('Building your tree')).toBeOnTheScreen();
  });

  it('opens a built branch’s page', async () => {
    const requests = await openBranches(MATHS);
    fireEvent.press(sheet().getByRole('button', { name: 'Geometry, quantitative, Open' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'geometry' },
    });
    expect(posts(requests)).toHaveLength(0);
    expect(screen.queryByTestId('explore-branches-sheet')).toBeNull();
  });

  it('closes on Close and leaves the list as it was', async () => {
    await openBranches(MATHS);
    fireEvent.press(sheet().getByRole('button', { name: 'Close' }));

    expect(screen.queryByTestId('explore-branches-sheet')).toBeNull();
    expect(screen.getByRole('button', { name: MATHS_ROW })).toBeOnTheScreen();
  });

  it('dismisses the keyboard before the sheet shows, so the sheet is not under it', async () => {
    await typeQuery({ [SUGGEST]: [json(200, { suggestions: [MATHS] })] }, 'math');
    const sheetAtDismiss: boolean[] = [];
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      sheetAtDismiss.push(screen.queryByTestId('explore-branches-sheet') !== null);
    });
    fireEvent.press(screen.getByRole('button', { name: MATHS_ROW }));
    await advance(0);

    expect(sheetAtDismiss).toStrictEqual([false]);
    expect(screen.getByTestId('explore-branches-sheet')).toBeOnTheScreen();
  });
});

describe('Explore: a built subject with branches', () => {
  it('keeps its count on the open topic’s row; its sheet lists the branches, Learn all opens it', async () => {
    const requests = await typeQuery(
      {
        [TOP]: [
          json(200, { topics: [openTopic('mathematics', 'Mathematics')], rows: [BUILT_MATHS] }),
        ],
        [SUGGEST]: [json(200, { suggestions: [BUILT_MATHS] })],
        [BRANCHES]: [json(200, NINE)],
      },
      'math',
    );

    const labels = screen
      .getAllByTestId('explore-row')
      .map((r) => r.props.accessibilityLabel as string);
    expect(labels).toStrictEqual(['Mathematics, 9 branches']);
    const row = screen.getByRole('button', { name: 'Mathematics, 9 branches' });
    expect(within(row).getByTestId('explore-row-chevron', HIDDEN)).toBeOnTheScreen();

    fireEvent.press(row);
    await advance(0);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toContain(BRANCHES);
    expect(sheet().getAllByTestId('explore-row')).toHaveLength(9);

    fireEvent.press(sheet().getByRole('button', { name: 'Learn all of Mathematics' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/topic/[slug]',
      params: { slug: 'mathematics' },
    });
    expect(posts(requests)).toHaveLength(0);
  });
});
