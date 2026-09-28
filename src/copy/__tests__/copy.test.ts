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

  it('titles the Today screen', () => {
    expect(copy.today).toBe('Today');
  });

  it('labels the four tabs in the tab bar', () => {
    expect(copy.tabs).toStrictEqual({
      today: 'Today',
      tree: 'Tree',
      explore: 'Explore',
      profile: 'Profile',
    });
  });

  it('titles the three placeholder tabs', () => {
    expect(copy.placeholder).toStrictEqual({
      tree: 'Skill tree',
      explore: 'Explore',
      profile: 'Profile',
    });
  });

  it('freezes the nested groups', () => {
    // `Object.isFrozen` is true for any primitive, so first check that each group is an object.
    expect(copy.tabs).toBeInstanceOf(Object);
    expect(copy.placeholder).toBeInstanceOf(Object);
    expect(Object.isFrozen(copy.tabs)).toBe(true);
    expect(Object.isFrozen(copy.placeholder)).toBe(true);
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
