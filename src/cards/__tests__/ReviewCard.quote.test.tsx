// The review card of a prose topic (M9 plan C Task 19, Q11): with `snippetStyle: 'quote'` the
// revealed card shows the answer and not the quoted source sentence, which with the answer and the
// rating row would overflow the card; the Sources action still links the source. Before the reveal
// nothing changes. The style absent or `code` is drawn as before (ReviewCard.test).
import { fireEvent, screen, within } from '@testing-library/react-native';

import type { ReviewCard as ReviewCardData } from '../../data';
import { useFeedStore } from '../../feed/store';
import { ReviewCard } from '../ReviewCard';
import { SourcesTarget } from '../SourcesButton';
import { renderChoiceCard } from '../testing/choiceCards';
import { demoCard } from '../testing/demoCards';
import { reveal, revealButton, renderReviewCard } from '../testing/reviewCards';

const QUOTE = 'Photosynthesis converts light energy into chemical energy stored in glucose.';
const SOURCE = {
  title: 'Photosynthesis',
  url: 'https://en.wikipedia.org/wiki/Photosynthesis',
  license: 'CC BY-SA 4.0',
};

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

  it('draws the answer and not the quote after the reveal', () => {
    renderReviewCard({ ...demo, snippet: QUOTE, snippetStyle: 'quote' }, 0);

    reveal();

    expect(partsInOrder()).toStrictEqual(['review-answer-text', 'review-spacer', 'rating-row']);
    expect(screen.queryByText(QUOTE)).toBeNull();
  });

  it('keeps the Sources action, which lists the source, after the reveal', () => {
    const card = { ...demo, snippet: QUOTE, snippetStyle: 'quote' as const, sources: [SOURCE] };
    renderChoiceCard((onNext) => (
      <SourcesTarget card={card}>
        <ReviewCard card={card} index={0} active onNext={onNext} />
      </SourcesTarget>
    ));

    reveal();
    fireEvent.press(screen.getByRole('button', { name: 'Show me the source' }));

    expect(
      within(screen.getByTestId('sources-sheet')).getByText('Photosynthesis'),
    ).toBeOnTheScreen();
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
