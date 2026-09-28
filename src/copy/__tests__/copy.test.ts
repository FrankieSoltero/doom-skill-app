import { copy, deepFreeze } from '../index';

describe('copy', () => {
  it('names the app LearnLoop', () => {
    expect(copy.appName).toBe('LearnLoop');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it('rejects an assignment to a key: a type error, and no change at run time', () => {
    let thrown: unknown = null;

    try {
      // @ts-expect-error -- `copy` is read-only. If this assignment ever type-checks, tsc fails.
      copy.appName = 'Changed';
    } catch (error) {
      thrown = error;
    }

    // A frozen object throws a TypeError in strict mode and ignores the write otherwise.
    expect(thrown === null || thrown instanceof TypeError).toBe(true);
    expect(copy.appName).toBe('LearnLoop');
  });

  it('speaks an answered option with its verdict', () => {
    expect(copy.optionCorrect('s("bd*4")')).toBe('s("bd*4"). Correct answer.');
    expect(copy.optionWrong('s("bd/4")')).toBe('s("bd/4"). Not correct.');
  });
});

describe('deepFreeze', () => {
  it('freezes every nested object and leaves functions callable', () => {
    const shout = (text: string) => `${text}!`;
    const frozen = deepFreeze({ group: { inner: { word: 'a' } }, shout, empty: null });

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.group)).toBe(true);
    expect(Object.isFrozen(frozen.group.inner)).toBe(true);
    expect(frozen.shout('hey')).toBe('hey!');
    expect(frozen.empty).toBeNull();
  });
});
