// The Summary card shows the points the set earned (the feed store's `pointsEarned`, summed from
// the attempts' replies) as a line under the title, and no line when the set earned none.
import { render, screen } from '@testing-library/react-native';

import { useFeedStore } from '../../feed/store';
import { SummaryCard } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

jest.mock('../../feed/useSummary', () => ({ useSummary: jest.fn() }));

function renderCard() {
  render(
    <SummaryCard
      set={summarySet()}
      active
      onKeepGoing={jest.fn()}
      onViewTree={jest.fn()}
      nextSetStatus="idle"
    />,
  );
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('SummaryCard and the points earned', () => {
  it('shows "+3 points" after replies of 2, 0 and 1', () => {
    [2, 0, 1].forEach((points) => {
      useFeedStore.getState().addPoints(points);
    });

    renderCard();

    expect(screen.getByTestId('summary-points')).toHaveTextContent('+3 points');
  });

  it('shows no line when the set earned no points', () => {
    useFeedStore.getState().addPoints(0);

    renderCard();

    expect(screen.queryByTestId('summary-points')).toBeNull();
    expect(screen.queryByText(/points/)).toBeNull();
  });
});
