// A catalog subject's branches sheet (src/topics/BranchesSheet.tsx; catalog learnable-topics plan,
// L6): the subject's title, "Learn all of …" doing the subject's own action, then its branches
// from `GET /catalog/{key}/branches`, each drawn by the caller's row and picked by its tap. Over
// the real API client and a fake network; the Explore tab's wiring is in
// app/(tabs)/__tests__/explore.suggest.test.tsx.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Pressable, ScrollView, Text } from 'react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { BranchesSheet } from '../BranchesSheet';
import type { ExploreRow } from '../useExploreResults';

const ROUTE = 'GET /catalog/wikidata%3AQ395/branches';
const SUBJECT: ExploreRow = {
  key: 'wikidata:Q395',
  label: 'Mathematics',
  group: 'quantitative',
  kind: 'academic discipline',
  builtSlug: null,
  source: 'catalog',
  branches: 2,
};
const branch = (key: string, label: string, built_slug: string | null) => ({
  key,
  label,
  group: 'quantitative',
  kind: 'academic discipline',
  rank: 500,
  built_slug,
  branches: 0,
});
const ALGEBRA = branch('wikidata:Q3968', 'Algebra', null);
const GEOMETRY = branch('wikidata:Q8087', 'Geometry', 'geometry');
const never = new Promise<Response>(() => undefined);

const onPick = jest.fn<undefined, [ExploreRow]>();
const onClose = jest.fn<undefined, []>();

/** A stand-in for the caller's row: its label, and its tap picks it. */
function Row({ row, onAct }: { row: ExploreRow; onAct: (row: ExploreRow) => void }) {
  return (
    <Pressable
      testID="branch-row"
      accessibilityRole="button"
      onPress={() => {
        onAct(row);
      }}
    >
      <Text>{row.label}</Text>
    </Pressable>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  onPick.mockClear();
  onClose.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderSheet(answer: Answer) {
  const requests = serveApi({ [ROUTE]: [answer] });
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <BranchesSheet subject={SUBJECT} Row={Row} onPick={onPick} onClose={onClose} />
    </Cache>,
  );
  await act(() => jest.advanceTimersByTimeAsync(0));
  return requests;
}

const sheet = () => within(screen.getByTestId('explore-branches-sheet'));

describe('BranchesSheet', () => {
  it('shows the subject, Learn all, the heading and its branches in the server’s order', async () => {
    const requests = await renderSheet(json(200, [ALGEBRA, GEOMETRY]));

    expect(requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([ROUTE]);
    expect(sheet().getByRole('header', { name: 'Mathematics' })).toBeOnTheScreen();
    expect(sheet().getByRole('button', { name: 'Learn all of Mathematics' })).toBeOnTheScreen();
    expect(sheet().getByText('Branches')).toBeOnTheScreen();
    const rows = sheet().getAllByTestId('branch-row');
    expect(rows.map((row) => within(row).getByText(/./).props.children as string)).toStrictEqual([
      'Algebra',
      'Geometry',
    ]);
    expect(sheet().getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    // A branch's first tap acts even while the search field's keyboard is up.
    const list = screen.UNSAFE_getByType(ScrollView).props as {
      keyboardShouldPersistTaps?: string;
    };
    expect(list.keyboardShouldPersistTaps).toBe('handled');
  });

  it('picks the subject itself on Learn all', async () => {
    await renderSheet(json(200, [ALGEBRA]));
    fireEvent.press(screen.getByRole('button', { name: 'Learn all of Mathematics' }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(SUBJECT);
  });

  it('picks a branch on its tap', async () => {
    await renderSheet(json(200, [ALGEBRA, GEOMETRY]));
    fireEvent.press(screen.getByText('Geometry'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ builtSlug: 'geometry' }));
  });

  it('closes on Close', async () => {
    await renderSheet(json(200, []));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    { when: 'the branches are on their way', answer: never, line: 'Loading branches…' },
    { when: 'the request failed', answer: json(500, {}), line: "Couldn't load branches" },
  ])('says so while $when, with Learn all still there', async ({ answer, line }) => {
    await renderSheet(answer);

    expect(sheet().getByText(line)).toBeOnTheScreen();
    expect(sheet().queryByTestId('branch-row')).toBeNull();
    expect(sheet().getByRole('button', { name: 'Learn all of Mathematics' })).toBeOnTheScreen();
  });

  it('shows no line for a subject with no branches after all', async () => {
    await renderSheet(json(200, []));

    expect(sheet().queryByText('Loading branches…')).toBeNull();
    expect(sheet().queryByText("Couldn't load branches")).toBeNull();
    expect(sheet().queryByTestId('branch-row')).toBeNull();
  });
});
