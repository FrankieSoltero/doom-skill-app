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
  ] as const)('names the %s card by its type and node', (cardType, expected) => {
    expect(cardKickerText(cardsByType[cardType])).toBe(expected);
  });

  it('accepts only concept, quiz, predict and exercise cards: tsc fails if another type-checks', () => {
    // Never called: the checks are the compiler's. Review and checkpoint cards write their own
    // kickers (README.md:115, :124), so passing one here is a type error.
    const reviewKicker = () =>
      // @ts-expect-error -- a review card's kicker is built from `lastSeenDays`, not its node.
      cardKickerText(cardsByType.review);
    const checkpointKicker = () =>
      // @ts-expect-error -- a checkpoint card's kicker names its milestone; it has no node.
      cardKickerText(cardsByType.checkpoint);

    expect(reviewKicker).toBeInstanceOf(Function);
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
