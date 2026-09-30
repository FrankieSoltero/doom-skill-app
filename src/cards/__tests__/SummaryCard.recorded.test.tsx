// The Summary card shows the set's recorded summary (the API's, src/feed/useSummary.ts) in place
// of the projected one once the store holds it; until then, the projected one.
import { render, screen } from '@testing-library/react-native';

import type { Summary } from '../../data';
import { useFeedStore } from '../../feed/store';
import { useSummary } from '../../feed/useSummary';
import { SummaryCard } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

jest.mock('../../feed/useSummary', () => ({ useSummary: jest.fn() }));

const RECORDED: Summary = {
  title: 'Recorded',
  progressDelta: 1,
  moved: [['Rests ~', 0.2, 0.25]],
  tomorrow: 'Polymeter',
  reminder: '7:00 pm',
};

function renderCard(active: boolean) {
  render(
    <SummaryCard
      set={summarySet()}
      active={active}
      onKeepGoing={jest.fn()}
      onViewTree={jest.fn()}
      nextSetStatus="idle"
    />,
  );
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(useSummary).mockClear();
});

describe('SummaryCard and the recorded summary', () => {
  it('shows the projected summary while none is recorded', () => {
    renderCard(true);

    expect(screen.getByText('topic progress, +3')).toBeOnTheScreen();
    expect(screen.getByText('0.42 → 0.61')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow: Euclidean rhythms · reminder at 8:30 pm')).toBeOnTheScreen();
  });

  it('shows the recorded summary in place of the projected one', () => {
    useFeedStore.setState({ recordedSummary: RECORDED });

    renderCard(true);

    expect(screen.getByText('topic progress, +1')).toBeOnTheScreen();
    expect(screen.getByText('0.20 → 0.25')).toBeOnTheScreen();
    expect(screen.queryByText('0.42 → 0.61')).toBeNull();
    expect(screen.getByText('Tomorrow: Polymeter · reminder at 7:00 pm')).toBeOnTheScreen();
  });

  it('asks for the recorded summary only while it is the current page', () => {
    renderCard(false);
    renderCard(true);

    expect(jest.mocked(useSummary).mock.calls).toStrictEqual([[false], [true]]);
  });
});
