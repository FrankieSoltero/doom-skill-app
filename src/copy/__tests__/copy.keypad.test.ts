// The code keypad's strings (M9 plan K), read through `copy`. copy.test.ts is at its line limit,
// so they are tested here.
import { copy } from '../index';

describe('copy for the code keypad', () => {
  it('labels the control keys', () => {
    expect(copy.keypadAbc).toBe('ABC');
    expect(copy.keypadDelete).toBe('Delete');
    expect(copy.keypadLeft).toBe('Move left');
    expect(copy.keypadRight).toBe('Move right');
    expect(copy.keypadHide).toBe('Hide keypad');
  });

  it('labels the action key of an exercise and of a checkpoint', () => {
    expect(copy.keypadRun).toBe('▶ Run');
    expect(copy.keypadSubmit).toBe('Submit');
  });

  it('names each key group', () => {
    expect(copy.keypadGroup).toEqual({
      calls: 'Sounds and calls',
      notation: 'Notation',
      methods: 'Methods',
      digits: 'Numbers',
    });
  });
});
