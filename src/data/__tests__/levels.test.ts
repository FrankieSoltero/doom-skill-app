// The level strings (src/copy/levels.ts, M10 plan L Task 13; decisions L16, L17), read through
// `copy`: the badge, Explore's range, the unlock moment's lines by `next`, the locked hint and the
// Q&A byline. `TopicDetail` and `CheckpointGrade` are read through the generated types, so their
// level fields need no parse here; the author's level is parsed in qa.test.ts.
import { copy } from '../../copy';

describe('copy.levels', () => {
  it('is frozen with the rest of copy', () => {
    expect(copy.levels).toBeInstanceOf(Object);
    expect(Object.isFrozen(copy.levels)).toBe(true);
  });

  it('names a level and the range of a family', () => {
    expect(copy.levels.badge(2)).toBe('Level 2');
    expect(copy.levels.range(3)).toBe('Levels 1–3');
    expect(copy.levels.range(2)).toBe('Levels 1–2');
    expect(copy.levels.range(1)).toBe('Level 1');
  });

  it('writes the unlock moment by what comes next', () => {
    expect(copy.levels.completed(1, 100)).toBe('Level 1 complete · +100 points');
    expect(copy.levels.continueTo(2)).toBe('Continue to Level 2');
    expect(copy.levels.building(2)).toBe("Level 2 is being built — you'll be the first in.");
    expect(copy.levels.waiting(3)).toBe('Level 3 is nearly ready.');
    expect(copy.levels.deepest).toBe("You've reached the deepest level for now.");
    expect(copy.levels.failed(3)).toBe("Level 3 couldn't be built.");
  });

  it('writes the locked hint and the byline', () => {
    expect(copy.levels.locked).toBe('Finish the level below to unlock');
    expect(copy.levels.byline(2)).toBe(' · Level 2');
  });

  it('writes the level-2 project choice (M11 plan Task 13; decision M21)', () => {
    expect(copy.levels.choose(2)).toBe('Choose your Level 2 project');
    expect(copy.levels.drafting(2)).toBe('Drafting your Level 2 projects…');
    expect(copy.levels.choicesLater(2)).toBe('Pick your Level 2 project on the topic screen.');
    expect(copy.levels.chosenOther).toBe('You picked another project for this level.');
    expect(copy.levels.choiceLine('Drum machine', 'techno')).toBe('Drum machine · techno');
    expect(copy.levels.pick).toBe('Choose');
  });
});
