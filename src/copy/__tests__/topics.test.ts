// The topic screens' strings (src/copy/topics.ts), read through `copy`.
import { copy } from '../index';

describe('copy for the topic screens', () => {
  it('freezes each group', () => {
    for (const group of [copy.explore, copy.pendingTopic, copy.topic, copy.tree]) {
      expect(group).toBeInstanceOf(Object);
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it('names a milestone by its position and title', () => {
    expect(copy.topic.milestone(2, 'Mini-notation')).toBe('Milestone 2: Mini-notation');
  });

  it('speaks a skill tree node by its mastery, or as locked', () => {
    expect(copy.tree.node('The REPL', 80, false)).toBe('The REPL, 80% mastered');
    expect(copy.tree.node('Euclid', 0, true)).toBe('Euclid, locked');
  });
});
