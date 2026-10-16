// The Explore tab's strings (Explore plan), read through `copy`. copy.test.ts is at its line
// limit, so they are tested here.
import { copy } from '../index';

describe('copy for the Explore list', () => {
  it('names the two row actions', () => {
    expect(copy.explore.open).toBe('Open');
    expect(copy.explore.build).toBe('Build');
  });

  it('names the Create button after the text', () => {
    expect(copy.explore.createText('zzqx')).toBe('Create zzqx');
  });

  it('reads a row as its label, its group when it has one, and its action', () => {
    expect(copy.explore.row('C++', 'Build', 'code')).toBe('C++, code, Build');
    expect(copy.explore.row('Strudel', 'Open', null)).toBe('Strudel, Open');
  });
});

describe('copy for a pending build', () => {
  it('says the place in the queue', () => {
    expect(copy.pendingTopic.queuedAhead(2)).toBe('Queued — 2 ahead');
    expect(copy.pendingTopic.queued).toBe('Queued');
  });

  it('names each stage', () => {
    expect(copy.pendingTopic.stage).toStrictEqual({
      resolving: 'Resolving sources',
      ingesting: 'Reading sources',
      synthesizing: 'Building the tree',
      generating: 'Writing cards',
      waiting: 'Waiting for a review',
    });
  });

  it('says why a build failed, and the topic page says the same', () => {
    expect(copy.pendingTopic.failed).toStrictEqual({
      invalidOutput: "Couldn't make sense of that text — try a suggestion",
      other: 'Build failed — try again later',
    });
    expect(copy.topic.proposed).toBe(copy.pendingTopic.stage.waiting);
    expect(copy.topic.failed).toBe(copy.pendingTopic.failed.other);
  });
});
