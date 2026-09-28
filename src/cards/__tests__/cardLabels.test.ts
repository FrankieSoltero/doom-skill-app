import { cardsByType } from '../../feed/testing/sets';
import { cardKickerText, cardMetaText } from '../cardLabels';

describe('cardKickerText', () => {
  it('writes the demo concept kicker, README.md:52 (uppercase comes from the style)', () => {
    expect(cardKickerText({ type: 'concept', node: 'Mini-notation' })).toBe(
      'Concept · Mini-notation',
    );
  });

  it.each([
    ['concept', 'Concept · mini-notation'],
    ['quiz', 'Quiz · mini-notation'],
    ['predict', 'Predict · mini-notation'],
    ['exercise', 'Exercise · mini-notation'],
    ['review', 'Review · mini-notation'],
  ] as const)('names the %s card by its type and node', (cardType, expected) => {
    expect(cardKickerText(cardsByType[cardType])).toBe(expected);
  });

  it('accepts only a card that names a node: tsc fails if a checkpoint card type-checks', () => {
    // Never called: the check is the compiler's. A checkpoint card has no `node`.
    const checkpointKicker = () =>
      // @ts-expect-error -- `cardKickerText` needs a card with a `node`.
      cardKickerText(cardsByType.checkpoint);

    expect(checkpointKicker).toBeInstanceOf(Function);
  });
});

describe('cardMetaText', () => {
  it.each([
    [20, '~20 s'],
    [40, '~40 s'],
    [90, '~90 s'],
    [119, '~119 s'],
    [120, '~2 min'],
    [150, '~3 min'],
    [180, '~3 min'],
  ])('writes %i seconds as %s (uppercase comes from the style)', (estSeconds, expected) => {
    expect(cardMetaText(estSeconds)).toBe(expected);
  });
});
