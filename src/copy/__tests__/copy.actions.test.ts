// The strings of the source and help sheets (M9 plan H, Task 4), read through `copy`.
// copy.test.ts is at its line limit, so they are tested here.
import { copy } from '../index';

describe('copy for the source and help sheets', () => {
  it('has the source sheet strings', () => {
    expect(copy.source).toEqual({
      action: 'Show me the source',
      title: 'Where this card comes from',
      loading: 'Finding the passage…',
      unavailable: 'The passage is not available right now.',
      own: 'This card was built from',
      more: 'More from this idea',
      links: 'Sources',
      open: 'Open the source',
    });
  });

  it('has the help sheet strings', () => {
    expect(copy.help).toEqual({
      action: 'Help with this card',
      title: 'Help with this card',
      testMe: 'Test me',
      testMeHint: 'One more practice card on this idea',
      deeper: 'Go deeper',
      deeperHint: 'The next idea that builds on this one',
      nothing: 'Nothing more to add here',
      full: 'This set is full',
      adding: 'Adding…',
      added: 'Added after this card',
      maybeAdded: 'The card may appear after a reload',
      failed: 'Could not add a card right now',
    });
  });

  it('has only non-empty strings without edge spaces', () => {
    for (const block of [copy.source, copy.help]) {
      for (const text of Object.values(block)) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).toBe(text.trim());
      }
    }
  });
});
