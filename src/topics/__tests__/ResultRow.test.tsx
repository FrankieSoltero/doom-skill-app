// One row of the Explore list (src/topics/ResultRow.tsx; curriculum catalog plan, C1 and C9): a
// catalog row shows its kind and the row above it under its label ("subject · Physics"), an area
// its kind alone; an open topic shows none. The row is read aloud as before: its label, group and
// action. The list and the branches sheet around it are in app/(tabs)/__tests__/explore.*.test.tsx.
import { render, screen, within } from '@testing-library/react-native';

import { ResultRow } from '../ResultRow';
import type { ExploreRow } from '../useExploreResults';

const catalogRow = (label: string, kind: string, depth: number, parent: string | null) =>
  ({
    key: `ocw:${label}`,
    label,
    group: 'quantitative',
    kind,
    builtSlug: null,
    source: 'catalog',
    branches: 0,
    tier: 1,
    depth,
    parent,
  }) satisfies ExploreRow;
const MECHANICS = catalogRow('Classical Mechanics', 'subject', 3, 'Physics');
const SCIENCE = catalogRow('Science', 'area', 1, null);
const STRUDEL: ExploreRow = {
  key: 'topic:strudel',
  label: 'Strudel',
  group: 'prose',
  // Open topics carry no kind today (useExploreResults); one that did still shows no kind line.
  kind: 'topic',
  builtSlug: 'strudel',
  source: 'topic',
  branches: 0,
  tier: 2,
  depth: 4,
  parent: null,
};

const onAct = jest.fn<undefined, [ExploreRow]>();
const row = () => within(screen.getByTestId('explore-row'));
/** Every text the row shows, in order. */
const texts = () =>
  row()
    .getAllByText(/./)
    .map((text) => text.props.children as string);

describe('ResultRow', () => {
  it('shows a subject’s kind and parent under its label, and reads as before', () => {
    render(<ResultRow row={MECHANICS} onAct={onAct} />);

    expect(texts()).toStrictEqual([
      'Classical Mechanics',
      'subject · Physics',
      'quantitative',
      'Build',
    ]);
    expect(screen.getByRole('button', { name: 'Classical Mechanics, quantitative, Build' })).toBe(
      screen.getByTestId('explore-row'),
    );
  });

  it('shows an area’s kind alone', () => {
    render(<ResultRow row={SCIENCE} onAct={onAct} />);

    expect(row().getByText('area')).toBeOnTheScreen();
    expect(row().queryByText(/·/)).toBeNull();
  });

  it('shows no kind line for an open topic', () => {
    render(<ResultRow row={STRUDEL} onAct={onAct} />);

    expect(texts()).toStrictEqual(['Strudel', 'Open']);
  });
});
