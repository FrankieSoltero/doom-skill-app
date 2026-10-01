// The topic and profile screens' strings (src/copy/topics.ts, profile.ts), read through `copy`.
import { copy } from '../index';

describe('copy for the topic and profile screens', () => {
  it('freezes each group', () => {
    const groups = [copy.explore, copy.pendingTopic, copy.topic, copy.tree, copy.profile];
    for (const group of [...groups, copy.reminder]) {
      expect(group).toBeInstanceOf(Object);
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it('names a milestone by its position and title', () => {
    expect(copy.topic.milestone(2, 'Mini-notation')).toBe('Milestone 2: Mini-notation');
  });

  it('writes a daily budget option and its spoken label', () => {
    expect(copy.profile.minutes(15)).toBe('15 min');
    expect(copy.profile.minutesLabel(15)).toBe('15 minutes a day');
  });

  it('speaks a skill tree node by its mastery, or as locked', () => {
    expect(copy.tree.node('The REPL', 80, false)).toBe('The REPL, 80% mastered');
    expect(copy.tree.node('Euclid', 0, true)).toBe('Euclid, locked');
  });
});
