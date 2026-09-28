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

  it('asks for an answer when a swipe is gated, README.md:43', () => {
    expect(copy.answerToContinue).toBe('Answer this card to continue');
  });

  it('labels the Next card button and speaks the pager position, with no previous-card label', () => {
    expect(copy.nextCard).toBe('Next card');
    expect(copy.cardPosition(1, 7)).toBe('Card 1 of 7');
    expect(copy.cardPosition(4, 7)).toBe('Card 4 of 7');
    expect(Object.keys(copy)).not.toContain('previousCard');
  });

  it('titles the Today screen', () => {
    expect(copy.today).toBe('Today');
  });

  it.each([
    { topic: 'Strudel', day: 4, horizon: 14, expected: 'STRUDEL · DAY 4 OF 14' },
    { topic: 'Rust ownership', day: 1, horizon: 21, expected: 'RUST OWNERSHIP · DAY 1 OF 21' },
    { topic: 'SQL', day: 10, horizon: 10, expected: 'SQL · DAY 10 OF 10' },
  ])(
    'writes the feed kicker for $topic, day $day of $horizon',
    ({ topic, day, horizon, expected }) => {
      expect(copy.kicker(topic, day, horizon)).toBe(expected);
    },
  );

  it.each([
    { topic: 'Strudel', set: 2, expected: 'STRUDEL · DAY 4 OF 14 · SET 2' },
    { topic: 'Rust ownership', set: 3, expected: 'RUST OWNERSHIP · DAY 4 OF 14 · SET 3' },
    { topic: 'SQL', set: 12, expected: 'SQL · DAY 4 OF 14 · SET 12' },
  ])('writes the feed kicker for $topic with set $set', ({ topic, set, expected }) => {
    expect(copy.kickerWithSet(topic, 4, 14, set)).toBe(expected);
  });

  it('speaks the feed progress and the streak', () => {
    expect(copy.progressLabel(3, 6)).toBe('3 of 6 cards done');
    expect(copy.progressLabel(0, 1)).toBe('0 of 1 cards done');
    expect(copy.streakLabel(12)).toBe('12 day streak');
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
    expect(copy.cardTypes).toBeInstanceOf(Object);
    expect(Object.isFrozen(copy.tabs)).toBe(true);
    expect(Object.isFrozen(copy.placeholder)).toBe(true);
    expect(Object.isFrozen(copy.cardTypes)).toBe(true);
  });
});

describe('copy for the Today screen', () => {
  it('words the loading, failure and empty states and the failed card', () => {
    expect(copy.loading).toBe('Loading…');
    expect(copy.retry).toBe('Retry');
    expect(copy.loadFailed).toBe("Couldn't load your cards.");
    expect(copy.nothingYet).toBe('Nothing to learn yet.');
    expect(copy.cardFailed).toBe("This card couldn't be shown.");
  });
});

describe('copy for cards', () => {
  it('names each card type for the card kicker', () => {
    expect(copy.cardTypes).toStrictEqual({
      concept: 'Concept',
      quiz: 'Quiz',
      predict: 'Predict',
      exercise: 'Exercise',
      review: 'Review',
      checkpoint: 'Checkpoint',
    });
  });

  it('writes the card kicker as type, middle dot, node, keeping case (the style uppercases)', () => {
    expect(copy.cardKicker('Concept', 'Mini-notation')).toBe('Concept · Mini-notation');
    expect(copy.cardKicker('Quiz', 'speed')).toBe('Quiz · speed');
  });

  it('writes a card estimate in seconds or minutes, lower case (the style uppercases)', () => {
    expect(copy.seconds(40)).toBe('~40 s');
    expect(copy.seconds(90)).toBe('~90 s');
    expect(copy.minutes(3)).toBe('~3 min');
  });

  it('labels a concept cycle tile by its number', () => {
    expect(copy.cycleLabel(1)).toBe('Cycle 1');
    expect(copy.cycleLabel(12)).toBe('Cycle 12');
  });

  it('words the verdicts of a quiz or predict answer, README.md:73', () => {
    expect(copy.correct).toBe('Correct.');
    expect(copy.notQuite).toBe('Not quite.');
  });

  it('writes an explanation led by its verdict in bold markers', () => {
    expect(copy.verdict('Correct.', '*4 repeats a step.')).toBe('**Correct.** *4 repeats a step.');
    expect(copy.verdict('Not quite.', 'Try again.')).toBe('**Not quite.** Try again.');
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
