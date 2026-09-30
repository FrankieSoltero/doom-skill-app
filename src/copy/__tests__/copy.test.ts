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

  it("words the app's crash screen", () => {
    expect(copy.appFailed).toBe('Something went wrong.');
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

describe('copy for the review card', () => {
  it('words the reveal button and the rating caption, README.md:116 and :119', () => {
    expect(copy.recallThenReveal).toBe('Recall it, then tap to reveal');
    expect(copy.howWell).toBe('How well did you remember?');
  });

  it.each([
    [0, 'Seen today'],
    [1, 'Seen 1 day ago'],
    [2, 'Seen 2 days ago'],
    [3, 'Seen 3 days ago'],
    [30, 'Seen 30 days ago'],
  ])('writes %i days since last seen as %s (the kicker style uppercases)', (days, expected) => {
    expect(copy.seenDaysAgo(days)).toBe(expected);
  });

  it('speaks a rating button as its label and its next interval, as given', () => {
    expect(copy.ratingLabel('Good', '4 days')).toBe('Good, next review in 4 days');
    expect(copy.ratingLabel('Again', '<1 min')).toBe('Again, next review in <1 min');
  });
});

describe('copy for the beat grid', () => {
  it.each([
    ['bd', 0, 'bd: 0 hits'],
    ['bd', 1, 'bd: 1 hit'],
    ['hh', 2, 'hh: 2 hits'],
    ['hh', 16, 'hh: 16 hits'],
  ])('speaks row %s with %i hits as %s', (name, hits, expected) => {
    expect(copy.gridRow(name, hits)).toBe(expected);
  });

  it('speaks the grid as its row strings, each ending a sentence', () => {
    expect(copy.gridLabel(['bd: 1 hit', 'hh: 4 hits'])).toBe('Beat grid. bd: 1 hit. hh: 4 hits');
    expect(copy.gridLabel(['sd: 0 hits'])).toBe('Beat grid. sd: 0 hits');
  });
});

describe('copy for the exercise card', () => {
  it('labels the buttons, the check results and the editor, README.md:103-108', () => {
    expect(copy.play).toBe('Play');
    expect(copy.stop).toBe('Stop');
    expect(copy.check).toBe('Check');
    expect(copy.specMet).toBe('Spec met');
    expect(copy.notYet).toBe('Not yet');
    expect(copy.codeEditor).toBe('Code editor');
  });

  it("labels the Done key over the editor's keyboard", () => {
    expect(copy.done).toBe('Done');
  });

  it('words the audio notices and their Reset action', () => {
    expect(copy.audioNeedsConnection).toBe('Audio needs a connection');
    expect(copy.audioUnavailable).toBe('Audio unavailable');
    expect(copy.audioError).toBe('Audio error');
    expect(copy.codeTooLong).toBe('The code is too long to play');
    expect(copy.resetAudio).toBe('Reset audio');
  });

  it('speaks a badge as its label, then its message', () => {
    expect(copy.badgeSpoken('Spec met', 'The hi-hat plays eight times.')).toBe(
      'Spec met. The hi-hat plays eight times.',
    );
    expect(copy.badgeSpoken('Audio unavailable', '')).toBe('Audio unavailable');
  });
});

describe('copy for the checkpoint card', () => {
  it('labels the button in each state, README.md:135-140', () => {
    expect(copy.submitForGrading).toBe('Submit for grading');
    expect(copy.grading).toBe('Grading against rubric…');
    expect(copy.finishToday).toBe('Finish today');
    expect(copy.resubmit).toBe('Resubmit');
  });

  it('writes the score line with a middle dot, README.md:139', () => {
    expect(copy.passedOf(3, 4)).toBe('Passed · 3 of 4');
    expect(copy.notYetOf(1, 4)).toBe('Not yet · 1 of 4');
  });

  it('writes the feedback of each grade outcome from the card, never fixed numbers', () => {
    expect(copy.checkpoint.all(1, 4)).toBe('Every item met. Milestone 2 is unlocked.');
    expect(copy.checkpoint.all(3, 4)).toBe('Every item met. Milestone 4 is unlocked.');
    expect(copy.checkpoint.all(4, 4)).toBe('Every item met. That was the last milestone.');
    expect(copy.checkpoint.pass(3, 4)).toBe(
      'Passes with 3 of 4 needed. Meet the struck-out items to make it stronger.',
    );
    expect(copy.checkpoint.fail(3, 4)).toBe(
      'Needs at least 3 of 4. Check the struck-out items and resubmit.',
    );
    expect(copy.checkpoint.fail(2, 5)).toBe(
      'Needs at least 2 of 5. Check the struck-out items and resubmit.',
    );
    expect(Object.isFrozen(copy.checkpoint)).toBe(true);
  });

  it('speaks a rubric row as its label and its state', () => {
    expect(copy.rubricItem('Kick drum (bd) present', 'passed')).toBe(
      'Kick drum (bd) present. Passed.',
    );
    expect(copy.rubricItem('Hi-hats', 'failed')).toBe('Hi-hats. Not met.');
    expect(copy.rubricItem('Hi-hats', 'notGraded')).toBe('Hi-hats. Not graded yet.');
  });

  it('names a milestone and the number of milestones, README.md:124', () => {
    expect(copy.milestoneOf(1, 4)).toBe('Milestone 1 of 4');
    expect(copy.milestoneOf(3, 3)).toBe('Milestone 3 of 3');
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

describe('copy for the Summary card', () => {
  it('words its buttons and its next-set states', () => {
    expect(copy.keepGoing).toBe('Keep going');
    expect(copy.viewSkillTree).toBe('View skill tree');
    expect(copy.loadingMore).toBe('Loading…');
    expect(copy.thatsEverything).toBe("That's everything for now.");
    expect(copy.couldNotLoadMore).toBe("Couldn't load more cards.");
  });

  it('writes the kicker, the stat labels and the mastery heading', () => {
    expect(copy.dayComplete(4)).toBe('DAY 4 COMPLETE');
    expect(copy.dayStreak).toBe('day streak');
    expect(copy.masteryMoved).toBe('Mastery moved');
    expect(copy.percent(34)).toBe('34%');
  });

  it.each([
    [3, 'topic progress, +3'],
    [0, 'topic progress, +0'],
    [-2, 'topic progress, -2'],
  ])('writes a progress delta of %p as %p', (delta, expected) => {
    expect(copy.topicProgress(delta)).toBe(expected);
  });

  it('writes a mastery change with two decimals and an arrow, and names its bar', () => {
    expect(copy.masteryDelta(0.42, 0.61)).toBe('0.42 → 0.61');
    expect(copy.masteryDelta(0.55, 0.7)).toBe('0.55 → 0.70');
    expect(copy.masteryDelta(0, 1)).toBe('0.00 → 1.00');
    expect(copy.masteryOf('Rests ~')).toBe('Rests ~ mastery');
  });

  it('writes the footer with the node in bold markers and a middle dot', () => {
    expect(copy.tomorrow('Euclidean rhythms', '8:30 pm')).toBe(
      'Tomorrow: **Euclidean rhythms** · reminder at 8:30 pm',
    );
  });

  it('holds the number words one to twenty, the nouns, and the title templates', () => {
    expect(copy.numberWords).toStrictEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
      'twenty',
    ]);
    expect(Object.isFrozen(copy.numberWords)).toBe(true);
    expect(copy.summaryNouns).toStrictEqual({
      card: 'card',
      cards: 'cards',
      minute: 'minute',
      minutes: 'minutes',
    });
    expect(copy.counted('Six', 'cards')).toBe('Six cards');
    expect(copy.summaryTitle('Six cards', 'Nine minutes')).toBe('Six cards. Nine minutes.');
  });
});
