// The review card's rating hint: one line under the rating buttons for the first three review
// ratings made on this phone (the feed store's `ratingsMade`), decided when the ratings appear.
import { act, screen } from '@testing-library/react-native';

import type { ReviewCard as ReviewCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { demoCard } from '../testing/demoCards';
import { rate, reveal, renderReviewCard } from '../testing/reviewCards';

const HINT = "Your answer decides when you'll see this again.";
const hint = () => screen.queryByText(HINT);

let demo: ReviewCardData;

beforeAll(async () => {
  demo = await demoCard('review');
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the demo card at `index` on a new set's empty answers, reveals it, and says if the hint shows. */
function revealCard(index: number): boolean {
  renderReviewCard(demo, index);
  reveal();
  return hint() !== null;
}

describe('the rating hint', () => {
  it('shows for the first three ratings made on this phone and not for the fourth', () => {
    const shown = [0, 1, 2, 3].map((index) => {
      const visible = revealCard(index);
      rate('Good');
      screen.unmount();
      return visible;
    });

    expect(shown).toStrictEqual([true, true, true, false]);
    expect(useFeedStore.getState().ratingsMade).toBe(4);
  });

  it('stays under the buttons after the third rating, which raises the count to 3', () => {
    useFeedStore.setState({ ratingsMade: 2 });
    revealCard(0);

    rate('Easy');

    expect(useFeedStore.getState().ratingsMade).toBe(3);
    expect(hint()).toBeOnTheScreen();
  });

  it('is decided when the ratings appear, not when the card is first drawn', () => {
    useFeedStore.setState({ ratingsMade: 2 });
    renderReviewCard(demo, 0);
    act(() => {
      useFeedStore.setState({ ratingsMade: 3 });
    });

    reveal();

    expect(hint()).toBeNull();
  });

  it('does not appear before the reveal', () => {
    renderReviewCard(demo, 0);

    expect(hint()).toBeNull();
  });
});
