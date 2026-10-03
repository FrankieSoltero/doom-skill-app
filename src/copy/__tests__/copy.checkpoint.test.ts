// The written checkpoint card's strings (M9 plan J), read through `copy`. copy.test.ts is at its
// line limit, so they are tested here.
import { copy } from '../index';

describe('copy for the written checkpoint card', () => {
  it('names the written editor, as its label and its placeholder', () => {
    expect(copy.yourAnswer).toBe('Your answer');
  });

  it('says a written answer was sent and when its result arrives', () => {
    expect(copy.sentForGrading).toBe('Sent for grading. Your result arrives in about a minute.');
  });
});
