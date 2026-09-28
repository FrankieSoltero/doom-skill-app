// Tests for the page's sample map load (src/strudel/page/audio.js): the time limit on the load,
// a load that finishes after it, reusing a load still under way, and how the player reports it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SAMPLES_LIMIT_MS } from '../../src/strudel/page/audio.js';
import {
  LOAD,
  PLAY,
  STOP,
  deferred,
  fakePlayer,
  never,
  preparer,
  settle,
  track,
} from './fakes.mjs';

const count = (log, name) => log.filter((entry) => entry === name).length;

/** Starts a prepare and moves the clock to the sample limit, one millisecond short. */
async function nearLimit(prep, clock) {
  const outcome = track(prep.prepare());
  await settle();
  clock.advance(SAMPLES_LIMIT_MS - 1);
  await settle();
  return outcome;
}

/** Runs `fn` and collects the unhandled rejections raised while it and its callbacks run. */
async function unhandledDuring(fn) {
  const seen = [];
  const listener = (reason) => seen.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await fn();
    await settle();
    await settle();
  } finally {
    process.off('unhandledRejection', listener);
  }
  return seen;
}

test('the sample limit is 5,000 ms', () => {
  assert.equal(SAMPLES_LIMIT_MS, 5000);
});

test('a sample map that loads before the limit plays with samples and clears the timer', async () => {
  const { prep, clock, log, failures } = preparer();
  assert.equal(await prep.prepare(), true);
  assert.deepEqual(log, ['resume', 'initAudio', 'samples']);
  assert.equal(failures.count, 0);
  assert.equal(clock.pending.size, 0);
  assert.deepEqual(clock.cleared, [1, 2]);
});

test('a sample map that never loads reports a network failure at the limit and plays', async () => {
  const { prep, clock, failures } = preparer({ samples: never });
  const outcome = await nearLimit(prep, clock);
  assert.equal(outcome.state, 'pending');
  assert.equal(failures.count, 0);
  clock.advance(1);
  await settle();
  assert.deepEqual(outcome, { state: 'resolved', value: true });
  assert.equal(failures.count, 1);
  assert.equal(clock.pending.size, 0);
});

test('a load that finishes after the limit reports nothing and is not waited for again', async () => {
  const late = deferred();
  const { prep, clock, log, failures } = preparer({ samples: () => late.promise });
  const outcome = await nearLimit(prep, clock);
  clock.advance(1);
  await settle();
  late.resolve();
  await settle();
  assert.deepEqual(outcome, { state: 'resolved', value: true });
  assert.equal(failures.count, 1);
  // The next play finds the samples loaded: no new download, no wait, no failure.
  assert.equal(await prep.prepare(), true);
  assert.equal(count(log, 'samples'), 1);
  assert.equal(failures.count, 1);
  assert.equal(clock.pending.size, 0);
});

test('a load that fails after the limit reports nothing and raises no rejection', async () => {
  const late = deferred();
  const answers = [late.promise, Promise.resolve()];
  const { prep, clock, log, failures } = preparer({ samples: () => answers.shift() });
  const seen = await unhandledDuring(async () => {
    await nearLimit(prep, clock);
    clock.advance(1);
    await settle();
    late.reject(new Error('error loading "strudel.json"'));
  });
  assert.deepEqual(seen, []);
  assert.equal(failures.count, 1);
  // The failed load is not kept: the next play downloads the map again.
  assert.equal(await prep.prepare(), true);
  assert.equal(count(log, 'samples'), 2);
  assert.equal(failures.count, 1);
  assert.equal(clock.pending.size, 0);
});

test('a load that fails before the limit reports one network failure and plays', async () => {
  const { prep, clock, failures } = preparer({
    samples: async () => Promise.reject(new Error('error loading "strudel.json"')),
  });
  assert.equal(await prep.prepare(), true);
  assert.equal(failures.count, 1);
  assert.equal(clock.pending.size, 0);
});

test('cancel during the sample wait ends it quietly and clears the timer', async () => {
  const late = deferred();
  const { prep, clock, failures } = preparer({ samples: () => late.promise });
  const outcome = track(prep.prepare());
  await settle();
  prep.cancel();
  await settle();
  assert.deepEqual(outcome, { state: 'resolved', value: false });
  assert.equal(clock.pending.size, 0);
  late.reject(new Error('error loading "strudel.json"'));
  clock.advance(SAMPLES_LIMIT_MS);
  await settle();
  assert.equal(failures.count, 0);
});

test('a play while the load is still under way reuses it, with a fresh limit', async () => {
  const late = deferred();
  const { prep, clock, log, failures } = preparer({ samples: () => late.promise });
  await nearLimit(prep, clock);
  clock.advance(1);
  await settle();
  assert.equal(failures.count, 1);
  const second = await nearLimit(prep, clock);
  assert.equal(second.state, 'pending');
  assert.equal(failures.count, 1);
  clock.advance(1);
  await settle();
  assert.deepEqual(second, { state: 'resolved', value: true });
  assert.equal(failures.count, 2);
  late.resolve();
  const third = track(prep.prepare());
  await settle();
  assert.deepEqual(third, { state: 'resolved', value: true });
  assert.equal(count(log, 'samples'), 1);
  assert.equal(failures.count, 2);
  assert.equal(clock.pending.size, 0);
});

test('a newer prepare ends the older sample wait and takes over the same load', async () => {
  const late = deferred();
  const { prep, clock, log, failures } = preparer({ samples: () => late.promise });
  const older = track(prep.prepare());
  await settle();
  const newer = track(prep.prepare());
  await settle();
  assert.deepEqual(older, { state: 'resolved', value: false });
  late.resolve();
  await settle();
  assert.deepEqual(newer, { state: 'resolved', value: true });
  assert.equal(count(log, 'samples'), 1);
  assert.equal(failures.count, 0);
  assert.equal(clock.pending.size, 0);
});

test('an older prepare that resumes late does not end the sample wait of the newer one', async () => {
  const slow = deferred();
  const starts = [slow.promise, Promise.resolve()];
  const { prep, clock, failures } = preparer({ initAudio: () => starts.shift(), samples: never });
  const older = track(prep.prepare());
  await settle();
  const newer = await nearLimit(prep, clock);
  slow.resolve();
  await settle();
  assert.deepEqual(older, { state: 'resolved', value: false });
  assert.equal(newer.state, 'pending');
  clock.advance(1);
  await settle();
  assert.deepEqual(newer, { state: 'resolved', value: true });
  assert.equal(failures.count, 1);
  assert.equal(clock.pending.size, 0);
});

test('Page: a sample map that hangs posts needsNetwork at the limit, then steps', async () => {
  const late = deferred();
  const { player, clock, calls, posted, tick } = fakePlayer({ samples: () => late.promise });
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  clock.advance(SAMPLES_LIMIT_MS - 1);
  await settle();
  assert.deepEqual(posted, []);
  clock.advance(1);
  await playing;
  tick();
  assert.deepEqual(posted, [{ type: 'needsNetwork' }, { type: 'step', step: 0 }]);
  late.resolve();
  await settle();
  assert.equal(count(calls, 'start'), 1);
  assert.equal(posted.length, 2);
  assert.equal(clock.pending.size, 0);
});

test('Page: stop during the sample wait posts nothing and nothing plays', async () => {
  const late = deferred();
  const { player, clock, calls, posted } = fakePlayer({ samples: () => late.promise });
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  await player.handle(STOP);
  await playing;
  assert.equal(clock.pending.size, 0);
  clock.advance(SAMPLES_LIMIT_MS);
  late.resolve();
  await settle();
  assert.deepEqual(posted, []);
  assert.equal(count(calls, 'start'), 0);
});

test('Page: a newer play during the sample wait posts needsNetwork once and plays once', async () => {
  const { player, clock, calls, posted } = fakePlayer({ samples: never });
  await player.handle(LOAD);
  const older = player.handle(PLAY);
  await settle();
  clock.advance(SAMPLES_LIMIT_MS - 1);
  const newer = player.handle(PLAY);
  await older;
  await settle();
  clock.advance(SAMPLES_LIMIT_MS);
  await newer;
  assert.deepEqual(posted, [{ type: 'needsNetwork' }]);
  assert.equal(count(calls, 'start'), 1);
  assert.equal(clock.pending.size, 0);
});
