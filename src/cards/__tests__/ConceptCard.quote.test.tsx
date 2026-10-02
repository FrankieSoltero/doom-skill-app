// The concept card of a prose topic (M9 plan C Task 19): with `snippetStyle: 'quote'` the snippet
// is a source sentence, drawn in a passage block with no comment line and no cycle tiles. A card
// with the style absent or `code` is drawn as before (ConceptCard.test.tsx, ConceptCard.plain).
import { render, screen, within } from '@testing-library/react-native';

import type { ConceptCard as ConceptCardData } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { ConceptCard } from '../ConceptCard';

const QUOTE = 'Photosynthesis converts light energy into chemical energy stored in glucose.';
const CODED: ConceptCardData = {
  ...cardsByType.concept,
  snippetComment: '// two steps',
  cycles: ['bd', 'sd'],
};
const QUOTED: ConceptCardData = { ...CODED, snippet: QUOTE, snippetStyle: 'quote' };

function renderCard(card: ConceptCardData) {
  render(<ConceptCard card={card} index={0} active onNext={jest.fn<undefined, []>()} />);
}

/** The test ids of the body's parts, in order. */
function partsInOrder(): string[] {
  const body = screen.getByTestId('card-frame-body');
  return within(body)
    .getAllByTestId(/^(passage|code-block|cycle-tiles|concept-spacer|primary-button-face)$/)
    .map((part) => String(part.props.testID));
}

afterEach(() => {
  jest.useRealTimers();
});

describe('ConceptCard with a quoted snippet', () => {
  it('draws the snippet in a passage, with no comment line and no tiles', () => {
    renderCard(QUOTED);

    expect(partsInOrder()).toStrictEqual(['passage', 'concept-spacer', 'primary-button-face']);
    expect(screen.getByTestId('passage-text')).toHaveTextContent(QUOTE, { exact: true });
    expect(screen.queryByTestId('code-block-comment')).toBeNull();
    expect(screen.queryByText('// two steps')).toBeNull();
    expect(screen.queryByTestId('cycle-tile')).toBeNull();
  });

  it('runs no highlight timer while active, though the card carries cycles', () => {
    jest.useFakeTimers();
    renderCard(QUOTED);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('draws a code-style snippet as code, with its comment and tiles', () => {
    renderCard({ ...CODED, snippetStyle: 'code' });

    expect(partsInOrder()).toStrictEqual([
      'code-block',
      'cycle-tiles',
      'concept-spacer',
      'primary-button-face',
    ]);
    expect(screen.getByTestId('code-block-comment')).toHaveTextContent('// two steps');
    expect(screen.queryByTestId('passage')).toBeNull();
  });
});
