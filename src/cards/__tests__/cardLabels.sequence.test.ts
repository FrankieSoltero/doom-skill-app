import { copy } from '../../copy';
import { cardKickerText, checkpointKickerText, reviewKickerText } from '../cardLabels';

describe('cardKickerText with a sequence', () => {
  it('keeps the kicker of a card outside a sequence', () => {
    expect(cardKickerText({ type: 'concept', node: 'Layering' })).toBe('Concept · Layering');
  });

  it('adds the place after the node', () => {
    const first = cardKickerText({
      type: 'concept',
      node: 'Layering',
      sequence: { index: 1, of: 2 },
    });
    const second = cardKickerText({
      type: 'predict',
      node: 'Layering',
      sequence: { index: 2, of: 2 },
    });
    expect(first).toBe('Concept · Layering · 1/2');
    expect(second).toBe('Predict · Layering · 2/2');
  });

  it('formats the part through copy.cardKickerPart', () => {
    expect(copy.cardKickerPart(1, 2)).toBe('1/2');
  });

  it('leaves the review and checkpoint kickers as they were', () => {
    expect(reviewKickerText({ type: 'review', lastSeenDays: 3 })).toBe('Review · Seen 3 days ago');
    expect(checkpointKickerText({ type: 'checkpoint', milestone: 1, milestoneCount: 4 })).toBe(
      'Checkpoint · Milestone 1 of 4',
    );
  });
});
