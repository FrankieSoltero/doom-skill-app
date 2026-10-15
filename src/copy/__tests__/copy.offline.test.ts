// The offline strings (offline-topic plan, Global Constraints), read through `copy`. copy.test.ts
// is at its line limit, so they are tested here.
import { copy } from '../index';

describe('copy for offline study', () => {
  it("marks the Summary's provisional points", () => {
    expect(copy.summary.syncing).toBe('syncing');
  });
});
