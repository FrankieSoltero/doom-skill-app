import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { FeedSet } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardTheme, colors, space, type } from '../../theme';
import { SummaryCard } from '../SummaryCard';
import type { SummaryCardProps } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

const HIDDEN = { includeHiddenElements: true };
const accessibility = jest.mocked(AccessibilityInfo);

type Status = SummaryCardProps['nextSetStatus'];

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useFeedStore.setState({ totals: { cards: 6, seconds: 540 }, streak: 13 });
  accessibility.announceForAccessibility.mockClear();
});

/** Renders the card over `set` in `status`, and returns its two callbacks. */
function renderSummary(status: Status = 'idle', set: FeedSet = summarySet()) {
  const onKeepGoing = jest.fn<undefined, []>();
  const onViewTree = jest.fn<undefined, []>();
  const element = (next: Status) => (
    <SummaryCard
      set={set}
      active
      onKeepGoing={onKeepGoing}
      onViewTree={onViewTree}
      nextSetStatus={next}
    />
  );
  const view = render(element(status));
  return {
    onKeepGoing,
    onViewTree,
    rerender: (next: Status) => {
      view.rerender(element(next));
    },
  };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('SummaryCard content', () => {
  it('is an ink card with a pink shadow, kicked by the day in the uppercase kicker style', () => {
    renderSummary('idle', { ...summarySet(), topic: { ...summarySet().topic, day: 7 } });

    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(colors.ink);
    expect(viewStyleOf(screen.getByTestId('card-frame-shadow')).backgroundColor).toBe(colors.pink);
    expect(textStyleOf(screen.getByText('DAY 7 COMPLETE'))).toMatchObject({
      ...type.kicker,
      textTransform: 'uppercase',
      color: cardTheme.summary.kicker,
    });
  });

  it('titles the day from the store totals, in lime, static, as a header of at most two lines', () => {
    renderSummary();

    const title = screen.getByRole('header', { name: 'Six cards. Nine minutes.' });
    expect(textStyleOf(title)).toMatchObject({ ...type.summaryTitle, color: colors.lime });
    expect(title.props).toMatchObject({ numberOfLines: 2, adjustsFontSizeToFit: true });
    act(() => {
      useFeedStore.setState({ totals: { cards: 12, seconds: 1080 } });
    });
    expect(title).toHaveTextContent('Twelve cards. Eighteen minutes.');
  });

  it('shows the streak on coral and the topic progress on aqua, at their final values', () => {
    renderSummary();

    const [streak, progress, ...others] = screen.getAllByTestId('stat-tile');
    if (streak === undefined || progress === undefined) throw new Error('Two stat tiles expected');
    expect(others).toHaveLength(0);
    expect(streak).toHaveTextContent('13day streak');
    expect(viewStyleOf(streak).backgroundColor).toBe(colors.coral);
    expect(progress).toHaveTextContent('34%topic progress, +3');
    expect(viewStyleOf(progress).backgroundColor).toBe(colors.aqua);
  });

  it('shows a negative progress delta with its minus sign', () => {
    const set = summarySet();
    renderSummary('idle', { ...set, summary: { ...set.summary, progressDelta: -2 } });

    expect(screen.getByText('topic progress, -2')).toBeOnTheScreen();
  });

  it('ends with tomorrow and the reminder, the node in bold', () => {
    renderSummary();

    const footer = screen.getByText('Tomorrow: Euclidean rhythms · reminder at 8:30 pm');
    expect(textStyleOf(footer)).toMatchObject({ ...type.small, color: colors.neutral[400] });
    expect(within(footer).getByTestId('bold-span')).toHaveTextContent('Euclidean rhythms');
  });
});

describe('SummaryCard mastery rows', () => {
  it('lists each moved node with its change and a bar at its new value: violet, coral, yellow', () => {
    renderSummary();

    expect(textStyleOf(screen.getByText('Mastery moved'))).toMatchObject({
      ...type.caption,
      color: colors.neutral[400],
    });
    expect(screen.getByText('0.42 → 0.61')).toBeOnTheScreen();
    expect(screen.getByText('0.55 → 0.70')).toBeOnTheScreen();
    expect(screen.getByText('0.80 → 0.88')).toBeOnTheScreen();
    const fills = screen.getAllByTestId('mastery-fill', HIDDEN).map(viewStyleOf);
    expect(fills.map(({ flex, backgroundColor }) => ({ flex, backgroundColor }))).toStrictEqual([
      { flex: 61, backgroundColor: colors.violet },
      { flex: 70, backgroundColor: colors.coral },
      { flex: 88, backgroundColor: colors.yellow },
    ]);
  });

  it('draws at most three rows: the first three of five, in order, colored in order', () => {
    const five: FeedSet['summary']['moved'] = [
      ['A', 0, 0.1],
      ['B', 0, 0.2],
      ['C', 0, 0.3],
      ['D', 0, 0.4],
      ['E', 0, 0.5],
    ];
    renderSummary('idle', summarySet(five));

    const names = screen
      .getAllByRole('progressbar')
      .map((bar) => String(bar.props.accessibilityLabel));
    expect(names).toStrictEqual(['A mastery', 'B mastery', 'C mastery']);
    expect(screen.queryByText('D')).toBeNull();
    expect(screen.queryByText('E')).toBeNull();
    const fills = screen.getAllByTestId('mastery-fill', HIDDEN).map(viewStyleOf);
    expect(fills.map((fill) => fill.backgroundColor)).toStrictEqual([
      colors.violet,
      colors.coral,
      colors.yellow,
    ]);
  });

  it('draws every row of a shorter list: two for two', () => {
    renderSummary(
      'idle',
      summarySet([
        ['A', 0, 0.1],
        ['B', 0, 0.2],
      ]),
    );

    expect(screen.getAllByTestId('mastery-bar')).toHaveLength(2);
  });

  it('shows no mastery list when no node moved', () => {
    renderSummary('idle', summarySet([]));

    expect(screen.queryByText('Mastery moved')).toBeNull();
    expect(screen.queryAllByTestId('mastery-bar', HIDDEN)).toHaveLength(0);
  });
});

describe('SummaryCard buttons', () => {
  it('Keep going: lime, enabled, and calls onKeepGoing once', () => {
    const { onKeepGoing, onViewTree } = renderSummary();

    fireEvent.press(button('Keep going'));

    expect(onKeepGoing).toHaveBeenCalledTimes(1);
    expect(onViewTree).not.toHaveBeenCalled();
    expect(button('Keep going')).toBeEnabled();
    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(
      colors.lime,
    );
  });

  it('View skill tree: an outline button beside it that calls onViewTree once', () => {
    const { onKeepGoing, onViewTree } = renderSummary();

    fireEvent.press(button('View skill tree'));

    expect(onViewTree).toHaveBeenCalledTimes(1);
    expect(onKeepGoing).not.toHaveBeenCalled();
    expect(viewStyleOf(button('View skill tree')).borderColor).toBe(colors.paper);
  });

  it('sets the two buttons side by side in equal halves, space[3] apart', () => {
    renderSummary();

    expect(viewStyleOf(screen.getByTestId('summary-buttons'))).toMatchObject({
      flexDirection: 'row',
      gap: space[3],
    });
    const halves = screen.getAllByTestId('summary-button-half').map(viewStyleOf);
    expect(halves.map((half) => half.flex)).toStrictEqual([1, 1]);
  });

  it.each([
    { status: 'idle', parts: ['summary-buttons'], halves: ['Keep going', 'View skill tree'] },
    { status: 'loading', parts: ['summary-buttons'], halves: ['Loading…', 'View skill tree'] },
    {
      status: 'none',
      parts: ['summary-status-line', 'summary-buttons'],
      halves: ['View skill tree'],
    },
    {
      status: 'error',
      parts: ['summary-status-line', 'summary-buttons'],
      halves: ['Retry', 'View skill tree'],
    },
  ] as const)('lays out $status: $parts, with $halves', ({ status, parts, halves }) => {
    renderSummary(status);

    const shown = within(screen.getByTestId('summary-status'))
      .getAllByTestId(/^summary-(status-line|buttons)$/)
      .map((part) => String(part.props.testID));
    expect(shown).toStrictEqual(parts);
    const labels = screen
      .getAllByTestId('summary-button-half')
      .map((half) => String(within(half).getByRole('button').props.accessibilityLabel));
    expect(labels).toStrictEqual(halves);
  });

  it('while loading: the button reads Loading…, is disabled, and does nothing', () => {
    const { onKeepGoing } = renderSummary('loading');

    fireEvent.press(button('Loading…'));

    expect(button('Loading…')).toBeDisabled();
    expect(onKeepGoing).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Keep going' })).toBeNull();
    expect(button('View skill tree')).toBeEnabled();
  });

  it("with no more sets: That's everything for now. in place of the button", () => {
    renderSummary('none');

    expect(screen.getByText("That's everything for now.")).toBeOnTheScreen();
    const labels = screen
      .getAllByRole('button')
      .map((each) => String(each.props.accessibilityLabel));
    expect(labels).toStrictEqual(['View skill tree']);
  });

  it('after a failed load: the error line, and Retry, which calls onKeepGoing once', () => {
    const { onKeepGoing } = renderSummary('error');

    expect(screen.getByText("Couldn't load more cards.")).toBeOnTheScreen();
    fireEvent.press(button('Retry'));

    expect(onKeepGoing).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Keep going' })).toBeNull();
  });
});

describe('SummaryCard status for screen readers', () => {
  it('holds the status line and the buttons in one polite live region', () => {
    renderSummary('none');

    const status = screen.getByTestId('summary-status');
    expect(status.props).toHaveProperty('accessibilityLiveRegion', 'polite');
    expect(status).toHaveTextContent("That's everything for now.View skill tree");
  });

  it('announces a change to none or error on iOS, once each, and nothing for idle or loading', () => {
    const { rerender } = renderSummary('idle');
    rerender('loading');
    expect(accessibility.announceForAccessibility).not.toHaveBeenCalled();

    rerender('error');
    rerender('error');
    rerender('loading');
    rerender('none');

    expect(accessibility.announceForAccessibility.mock.calls).toStrictEqual([
      ["Couldn't load more cards."],
      ["That's everything for now."],
    ]);
  });

  it.each(['none', 'error'] as const)(
    'does not announce a Summary that mounts already in %s, only a later change back to it',
    (status) => {
      const { rerender } = renderSummary(status);
      rerender(status);
      expect(accessibility.announceForAccessibility).not.toHaveBeenCalled();

      rerender('loading');
      rerender(status);

      expect(accessibility.announceForAccessibility).toHaveBeenCalledTimes(1);
    },
  );
});
