// The learner's enrollments on Explore (src/topics/MyTopics.tsx; my-topics plan Task 3, decisions
// T1 and T5): `orderEnrollments`, which puts the most recently studied first and completed ones
// last, and the list's rows — title, level badge, then the percent or the tick — each a button
// that hands its slug to `onOpen`. Pure: no network, no router.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { copy } from '../../copy';
import { colors } from '../../theme';
import { MyTopics, orderEnrollments } from '../MyTopics';
import type { Enrollment } from '../useEnrollments';

/** An active enrollment of `slug`, started 2026-10-01 and never studied, unless `over` says so. */
function enrollment(slug: string, over: Partial<Enrollment> = {}): Enrollment {
  return {
    topic_slug: slug,
    topic_title: slug,
    status: 'active',
    daily_minutes: 15,
    horizon_days: 14,
    progress: 0,
    started_at: '2026-10-01T00:00:00Z',
    level: 1,
    last_studied_at: null,
    ...over,
  };
}

const at = (time: string) => `2026-10-09T${time}:00Z`;
const slugs = (list: Enrollment[]) => list.map((e) => e.topic_slug);

const STRUDEL = enrollment('strudel', { topic_title: 'Strudel', progress: 0.405 });

describe('orderEnrollments', () => {
  it('puts the most recently studied first', () => {
    const a = enrollment('a', { last_studied_at: at('10:00') });
    const b = enrollment('b', { last_studied_at: at('12:00') });
    expect(slugs(orderEnrollments([a, b]))).toEqual(['b', 'a']);
  });

  it('sorts a never-studied enrollment by when it was started', () => {
    const a = enrollment('a', { started_at: at('09:00') });
    const b = enrollment('b', { last_studied_at: at('08:00') });
    expect(slugs(orderEnrollments([b, a]))).toEqual(['a', 'b']);
  });

  it('puts a completed enrollment last, however recent', () => {
    const c = enrollment('c', { status: 'completed', last_studied_at: at('13:00') });
    const a = enrollment('a', { last_studied_at: at('10:00') });
    expect(slugs(orderEnrollments([c, a]))).toEqual(['a', 'c']);
  });

  it('breaks a tie by slug', () => {
    const b = enrollment('b', { last_studied_at: at('10:00') });
    const a = enrollment('a', { last_studied_at: at('10:00') });
    expect(slugs(orderEnrollments([b, a]))).toEqual(['a', 'b']);
  });

  it('leaves its input as it was', () => {
    const input = [
      enrollment('a', { last_studied_at: at('10:00') }),
      enrollment('b', { last_studied_at: at('12:00') }),
    ];
    const before = slugs(input);
    orderEnrollments(input);
    expect(slugs(input)).toEqual(before);
  });

  it('compares times as instants, not as strings', () => {
    // 10:00+02:00 is 08:00Z: as strings it would sort after 09:00Z, as instants it is earlier.
    const a = enrollment('a', { last_studied_at: '2026-10-09T10:00:00+02:00' });
    const b = enrollment('b', { last_studied_at: '2026-10-09T09:00:00Z' });
    expect(slugs(orderEnrollments([a, b]))).toEqual(['b', 'a']);
    // The same instant written two ways is a tie, broken by slug.
    const c = enrollment('c', { last_studied_at: '2026-10-09T12:00:00+02:00' });
    const d = enrollment('d', { last_studied_at: at('10:00') });
    expect(slugs(orderEnrollments([d, c]))).toEqual(['c', 'd']);
  });
});

describe('MyTopics', () => {
  it('shows a row: the title, the level badge and the percent', () => {
    render(<MyTopics enrollments={[STRUDEL]} onOpen={jest.fn()} />);
    const row = screen.getByTestId('my-topic-strudel');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(copy.explore.rowLabel('Strudel', 1, '41%'));
    expect(screen.getByText('Strudel')).toBeTruthy();
    expect(screen.getByText(copy.levels.badge(1))).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.queryByText(copy.explore.tick)).toBeNull();
  });

  it('shows the tick in place of the percent on a completed row', () => {
    render(
      <MyTopics
        enrollments={[{ ...STRUDEL, status: 'completed', progress: 1 }]}
        onOpen={jest.fn()}
      />,
    );
    const row = screen.getByTestId('my-topic-strudel');
    expect(row.props.accessibilityLabel).toBe(
      copy.explore.rowLabel('Strudel', 1, copy.explore.completed),
    );
    const tick = screen.getByText('✓');
    expect(tick.props.accessibilityLabel).toBe(copy.explore.completed);
    expect(textStyleOf(tick).color).toBe(colors.ink);
    expect(viewStyleOf(screen.getByTestId('my-topic-strudel-tick')).backgroundColor).toBe(
      colors.lime,
    );
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('draws the badge on the yellow ground in ink', () => {
    render(<MyTopics enrollments={[STRUDEL]} onOpen={jest.fn()} />);
    expect(viewStyleOf(screen.getByTestId('my-topic-strudel-badge')).backgroundColor).toBe(
      colors.yellow,
    );
    expect(textStyleOf(screen.getByText(copy.levels.badge(1))).color).toBe(colors.ink);
  });

  it('hands the slug to onOpen when a row is pressed', () => {
    const onOpen = jest.fn();
    render(<MyTopics enrollments={[STRUDEL]} onOpen={onOpen} />);
    fireEvent.press(screen.getByTestId('my-topic-strudel'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('strudel');
  });

  it('renders nothing for no enrollments', () => {
    const { toJSON } = render(<MyTopics enrollments={[]} onOpen={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the heading once over the list', () => {
    const other = enrollment('sql', { topic_title: 'SQL' });
    render(<MyTopics enrollments={[STRUDEL, other]} onOpen={jest.fn()} />);
    expect(screen.getAllByText(copy.explore.myTopics)).toHaveLength(1);
    expect(screen.getByTestId('explore-my-topics')).toBeTruthy();
  });

  it('draws the rows in the order orderEnrollments gives', () => {
    const old = enrollment('old', { last_studied_at: at('08:00') });
    const recent = enrollment('recent', { last_studied_at: at('12:00') });
    render(<MyTopics enrollments={[old, recent]} onOpen={jest.fn()} />);
    const ids = screen.getAllByRole('button').map((b) => b.props.testID as string);
    expect(ids).toEqual(['my-topic-recent', 'my-topic-old']);
  });
});
