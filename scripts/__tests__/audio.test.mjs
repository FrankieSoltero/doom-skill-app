// Tests for the page's audio start (src/strudel/page/audio.js): resuming the audio context within
// a time limit, and how the player reports a start that hangs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AUDIO_DID_NOT_START, RESUME_LIMIT_MS } from '../../src/strudel/page/audio.js';
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

test('the limit is 3,000 ms and its message is fixed', () => {
  assert.equal(RESUME_LIMIT_MS, 3000);
  assert.equal(AUDIO_DID_NOT_START, 'Audio did not start');
});

test('a resume before the limit starts audio and clears the timer', async () => {
  const { prep, clock, log } = preparer();
  assert.equal(await prep.prepare(), true);
  assert.deepEqual(log, ['resume', 'initAudio', 'samples']);
  assert.equal(clock.pending.size, 0);
  assert.deepEqual(clock.cleared, [1, 2]);
});

test('a resume that never settles fails at the limit and nothing starts', async () => {
  const { prep, clock, log } = preparer({ resume: never });
  const outcome = track(prep.prepare());
  await settle();
  clock.advance(RESUME_LIMIT_MS - 1);
  await settle();
  assert.equal(outcome.state, 'pending');
  clock.advance(1);
  await settle();
  assert.equal(outcome.state, 'rejected');
  assert.equal(outcome.error.message, AUDIO_DID_NOT_START);
  assert.deepEqual(log, ['resume']);
});

test('a resume that settles after the limit is ignored', async () => {
  const late = deferred();
  const { prep, clock, log } = preparer({ resume: () => late.promise });
  const outcome = track(prep.prepare());
  await settle();
  clock.advance(RESUME_LIMIT_MS);
  late.resolve();
  await settle();
  assert.equal(outcome.state, 'rejected');
  assert.deepEqual(log, ['resume']);
});

test('cancel before the limit ends the wait quietly and clears the timer', async () => {
  const { prep, clock, log } = preparer({ resume: never });
  const outcome = track(prep.prepare());
  await settle();
  prep.cancel();
  await settle();
  assert.deepEqual(outcome, { state: 'resolved', value: false });
  assert.equal(clock.pending.size, 0);
  clock.advance(RESUME_LIMIT_MS);
  await settle();
  assert.deepEqual(log, ['resume']);
});

test('a newer prepare ends the older wait', async () => {
  const first = deferred();
  const answers = [first.promise, Promise.resolve()];
  const { prep, clock } = preparer({ resume: () => answers.shift() });
  const older = track(prep.prepare());
  await settle();
  assert.equal(await prep.prepare(), true);
  first.resolve();
  await settle();
  assert.deepEqual(older, { state: 'resolved', value: false });
  assert.equal(clock.pending.size, 0);
});

test('a late settle from a timed-out wait leaves the newer wait alone', async () => {
  const late = deferred();
  const answers = [late.promise, never()];
  const { prep, clock } = preparer({ resume: () => answers.shift() });
  const older = track(prep.prepare());
  await settle();
  clock.advance(RESUME_LIMIT_MS);
  await settle();
  assert.equal(older.state, 'rejected');
  const newer = track(prep.prepare());
  await settle();
  late.resolve();
  await settle();
  prep.cancel();
  await settle();
  assert.deepEqual(newer, { state: 'resolved', value: false });
  assert.equal(clock.pending.size, 0);
});

test('a rejection before the limit fails with that error and clears the timer', async () => {
  const { prep, clock } = preparer({
    resume: async () => Promise.reject(new Error('not allowed')),
  });
  await assert.rejects(prep.prepare(), { message: 'not allowed' });
  assert.equal(clock.pending.size, 0);
});

test('Page: an audio start that hangs posts one error at the limit and nothing plays', async () => {
  const late = deferred();
  const { player, clock, calls, posted } = fakePlayer({ resume: () => late.promise });
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  clock.advance(RESUME_LIMIT_MS);
  await playing;
  assert.deepEqual(posted, [{ type: 'error', message: AUDIO_DID_NOT_START }]);
  late.resolve();
  await settle();
  assert.deepEqual(posted.length, 1);
  assert.ok(!calls.includes('start'));
});

test('Page: stop before the limit posts nothing and nothing plays', async () => {
  const { player, clock, calls, posted } = fakePlayer({ resume: never });
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  await player.handle(STOP);
  await playing;
  clock.advance(RESUME_LIMIT_MS);
  await settle();
  assert.deepEqual(posted, []);
  assert.equal(clock.pending.size, 0);
  assert.ok(!calls.includes('start'));
});

test('Page: a play abandoned by a failed load does not report the audio limit', async () => {
  const { player, clock, calls, posted } = fakePlayer({ resume: never });
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  await player.handle(JSON.stringify({ type: 'load', code: 'bad' }));
  clock.advance(RESUME_LIMIT_MS);
  await playing;
  assert.deepEqual(posted, [{ type: 'error', message: 'bad code' }]);
  assert.ok(!calls.includes('start'));
});
