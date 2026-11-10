// The Explore tab's kind lines and credit (app/(tabs)/explore.tsx over src/topics/ResultRow.tsx;
// curriculum catalog plan, C1 and C9): each catalog row in the list, and each branch in a
// subject's sheet, shows its kind and the row above it under its label; under the list, whatever
// it shows, one line credits the catalog's source. Over the real API client and a fake network;
// the rows alone are in src/topics/__tests__/ResultRow.test.tsx.
import { fireEvent, screen, within } from '@testing-library/react-native';

import { json, serveApi, type Answer } from '../../../src/api/testing/fakeApi';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { copy } from '../../../src/copy';
import { useFocusEffect as mockUseFocusEffect } from '../../../src/topics/testing/focus';
import ExploreScreen from '../explore';

// No row here navigates: the router needs only its focus hook.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);

/** A catalog row as the server sends it. */
const row = (label: string, kind: string, parent: string | null, branches = 0) => ({
  key: `ocw:${label.toLowerCase().replace(' ', '-')}`,
  label,
  group: 'quantitative',
  kind,
  rank: 0,
  built_slug: null,
  branches,
  tier: 1,
  depth: { area: 1, field: 2, subject: 3 }[kind] ?? 4,
  parent,
});
const SCIENCE = row('Science', 'area', null);
const PHYSICS = row('Physics', 'field', 'Science', 2);
const MECHANICS = row('Classical Mechanics', 'subject', 'Physics');
const QUANTUM = row('Quantum Mechanics', 'subject', 'Physics');
const PHYSICS_ROW = 'Physics, quantitative, 2 branches';
const SUGGEST = 'GET /topics/suggest';
const suggested = (rows: object[]) => [json(200, { suggestions: rows, has_more: false })];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Renders the tab over `routes` (no enrollments, no preloaded rows) and types `text`. */
async function typeQuery(routes: Record<string, Answer[]>, text: string) {
  serveApi({
    'GET /me/enrollments': [json(200, { enrollments: [] })],
    'GET /topics/suggest/top': [json(200, { topics: [], rows: [], has_more: false })],
    ...routes,
  });
  await renderScreen(<ExploreScreen />);
  fireEvent.changeText(screen.getByLabelText('Search topics'), text);
  await advance(300);
}

const rowNamed = (name: string) => within(screen.getByRole('button', { name }));
const credit = () => screen.getByText(copy.explore.attribution);

describe('Explore: kind lines', () => {
  it('shows each row’s kind and parent under its label, an area its kind alone', async () => {
    await typeQuery({ [SUGGEST]: suggested([MECHANICS, SCIENCE]) }, 'sci');

    const mechanics = rowNamed('Classical Mechanics, quantitative, Build');
    expect(mechanics.getByText('subject · Physics')).toBeOnTheScreen();
    expect(rowNamed('Science, quantitative, Build').getByText('area')).toBeOnTheScreen();
  });

  it('shows each branch’s kind line in a subject’s sheet', async () => {
    await typeQuery(
      {
        [SUGGEST]: suggested([PHYSICS]),
        'GET /catalog/ocw%3Aphysics/branches': [json(200, [MECHANICS, QUANTUM])],
      },
      'phys',
    );
    expect(rowNamed(PHYSICS_ROW).getByText('field · Science')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: PHYSICS_ROW }));
    await advance(0);

    const sheet = within(screen.getByTestId('explore-branches-sheet'));
    const branches = sheet.getAllByTestId('explore-row');
    const lines = branches.map(
      (branch) => within(branch).getByText(/ · /).props.children as string,
    );
    expect(lines).toStrictEqual(['subject · Physics', 'subject · Physics']);
  });
});

describe('Explore: the credit line', () => {
  it('credits the source under the rows, as text', async () => {
    await typeQuery({ [SUGGEST]: suggested([MECHANICS]) }, 'mech');

    expect(credit()).toHaveProp('accessibilityRole', 'text');
  });

  it('credits it under Create when nothing matched, and before anything is typed', async () => {
    await typeQuery({ [SUGGEST]: suggested([]) }, 'zzqx');
    expect(screen.getByRole('button', { name: 'Create zzqx' })).toBeOnTheScreen();
    expect(credit()).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Search topics'), '');
    await advance(300);
    expect(screen.getByText(copy.explore.idle)).toBeOnTheScreen();
    expect(credit()).toBeOnTheScreen();
  });
});
