// The Summary card shows the set's recorded summary (the API's, src/feed/useSummary.ts) in place
// of the projected one once the store holds it; until then, the projected one.
import { render, screen } from '@testing-library/react-native';

import { queryWrapper } from '../../api/testing/fakeApi';
import type { Summary } from '../../data';
import { useFeedStore } from '../../feed/store';
import { useSummary } from '../../feed/useSummary';
import { useFocusEffect as mockUseFocusEffect } from '../../topics/testing/focus';
import { SummaryCard } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

jest.mock('../../feed/useSummary', () => ({ useSummary: jest.fn() }));
// The card reads the topic's tree through the query cache, under a stand-in for Expo Router's
// focus; with no API here the tree is not read.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const RECORDED: Summary = {
  title: 'Recorded',
  progressDelta: 1,
  progressAfter: 0.41,
  moved: [['Rests ~', 0.2, 0.25]],
  tomorrow: 'Polymeter',
  reminder: '7:00 pm',
};

function renderCard(active: boolean, set = summarySet()) {
  const { wrapper: Cache } = queryWrapper();
  render(
    <Cache>
      <SummaryCard
        set={set}
        active={active}
        onKeepGoing={jest.fn()}
        onViewTree={jest.fn()}
        nextSetStatus="idle"
      />
    </Cache>,
  );
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(useSummary).mockClear();
});

describe('SummaryCard and the recorded summary', () => {
  it('shows the projected summary while none is recorded', () => {
    renderCard(true);

    expect(screen.getByText('0.42 → 0.61')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow: Euclidean rhythms · reminder at 8:30 pm')).toBeOnTheScreen();
  });

  it('shows the recorded summary in place of the projected one', () => {
    useFeedStore.setState({ recordedSummary: RECORDED });

    renderCard(true);

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

describe('SummaryCard points tile and footer', () => {
  it("shows the set's points, never the recorded summary's mastery-based progress", () => {
    useFeedStore.setState({
      recordedSummary: { ...RECORDED, progressDelta: 5, progressAfter: 0.05 },
    });
    useFeedStore.getState().addPoints(4);
    const set = summarySet();

    renderCard(true, { ...set, topic: { ...set.topic, progress: 0 } });

    expect(screen.getByTestId('points-tile')).toHaveTextContent('+4 points', { exact: true });
    expect(screen.queryByText(/%|topic progress/)).toBeNull();
  });

  it('leaves the reminder out of the footer when none is set', () => {
    const set = summarySet();

    renderCard(true, { ...set, summary: { ...set.summary, reminder: null } });

    expect(screen.getByText('Tomorrow: Euclidean rhythms')).toBeOnTheScreen();
    expect(screen.queryByText(/reminder at/)).toBeNull();
  });
});
