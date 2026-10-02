// The review card of a prose topic (M9 plan C Task 19): with `snippetStyle: 'quote'` the revealed
// answer is followed by the quoted source sentence in a passage block instead of a code block.
// Before the reveal nothing changes. The style absent or `code` is drawn as before (ReviewCard.test).
import { screen, within } from '@testing-library/react-native';

import type { ReviewCard as ReviewCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { demoCard } from '../testing/demoCards';
import { reveal, revealButton, renderReviewCard } from '../testing/reviewCards';

const QUOTE = 'Photosynthesis converts light energy into chemical energy stored in glucose.';

let demo: ReviewCardData;

beforeAll(async () => {
  demo = await demoCard('review');
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** The test ids of the body's parts, in order. */
function partsInOrder(): string[] {
  return within(screen.getByTestId('card-frame-body'))
    .getAllByTestId(/^(review-answer-text|passage|code-block|review-spacer|rating-row)$/)
    .map((part) => String(part.props.testID));
}

describe('ReviewCard with a quoted snippet', () => {
  it('shows only the reveal button before the reveal', () => {
    renderReviewCard({ ...demo, snippet: QUOTE, snippetStyle: 'quote' }, 0);

    expect(revealButton()).toBeOnTheScreen();
    expect(screen.queryByTestId('passage')).toBeNull();
    expect(screen.queryByTestId('code-block')).toBeNull();
  });

  it('draws the answer, then the snippet in a passage, after the reveal', () => {
    renderReviewCard({ ...demo, snippet: QUOTE, snippetStyle: 'quote' }, 0);

    reveal();

    expect(partsInOrder()).toStrictEqual([
      'review-answer-text',
      'passage',
      'review-spacer',
      'rating-row',
    ]);
    expect(screen.getByTestId('passage-text')).toHaveTextContent(QUOTE, { exact: true });
  });

  it('draws a code-style snippet in the code block after the reveal', () => {
    renderReviewCard({ ...demo, snippetStyle: 'code' }, 0);

    reveal();

    expect(partsInOrder()).toStrictEqual([
      'review-answer-text',
      'code-block',
      'review-spacer',
      'rating-row',
    ]);
  });
});
