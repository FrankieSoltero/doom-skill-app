// Tests for the page's audio start (src/strudel/page/audio.js): resuming the audio context within
// a time limit, and how the player reports a start that hangs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUDIO_DID_NOT_START,
  RESUME_LIMIT_MS,
  createAudioPreparer,
} from '../../src/strudel/page/audio.js';
import { createPlayer } from '../../src/strudel/page/player.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  const handle = {};
  handle.promise = new Promise((resolve, reject) => Object.assign(handle, { resolve, reject }));
  return handle;
}

// Timeouts that run only when the test moves the clock on.
function fakeClock() {
  const clock = { now: 0, pending: new Map(), next: 1, cleared: [] };
  clock.setTimeout = (fn, ms) => {
    const id = clock.next++;
    clock.pending.set(id, { fn, at: clock.now + ms });
    return id;
  };
  clock.clearTimeout = (id) => {
    clock.cleared.push(id);
    clock.pending.delete(id);
  };
  clock.advance = (ms) => {
    clock.now += ms;
    for (const [id, timer] of [...clock.pending]) {
      if (timer.at > clock.now) continue;
      clock.pending.delete(id);
      timer.fn();
    }
  };
  return clock;
}

function preparer(resume) {
  const clock = fakeClock();
  const log = [];
  const audio = {
    getAudioContext: () => ({ resume: () => (log.push('resume'), resume()) }),
    initAudio: async () => void log.push('initAudio'),
    samples: async () => void log.push('samples'),
  };
  const prep = createAudioPreparer({ audio, onNetworkFailure: () => {}, timers: clock });
  return { prep, clock, log };
}

// Records how a promise ended, without awaiting it.
function track(promise) {
  const outcome = { state: 'pending' };
  promise.then(
    (value) => Object.assign(outcome, { state: 'resolved', value }),
    (error) => Object.assign(outcome, { state: 'rejected', error }),
  );
  return outcome;
}

test('the limit is 3,000 ms and its message is fixed', () => {
  assert.equal(RESUME_LIMIT_MS, 3000);
  assert.equal(AUDIO_DID_NOT_START, 'Audio did not start');
});

test('a resume before the limit starts audio and clears the timer', async () => {
  const { prep, clock, log } = preparer(async () => {});
  assert.equal(await prep.prepare(), true);
  assert.deepEqual(log, ['resume', 'initAudio', 'samples']);
  assert.equal(clock.pending.size, 0);
  assert.deepEqual(clock.cleared, [1]);
});

test('a resume that never settles fails at the limit and nothing starts', async () => {
  const { prep, clock, log } = preparer(() => new Promise(() => {}));
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
  const { prep, clock, log } = preparer(() => late.promise);
  const outcome = track(prep.prepare());
  await settle();
  clock.advance(RESUME_LIMIT_MS);
  late.resolve();
  await settle();
  assert.equal(outcome.state, 'rejected');
  assert.deepEqual(log, ['resume']);
});

test('cancel before the limit ends the wait quietly and clears the timer', async () => {
  const { prep, clock, log } = preparer(() => new Promise(() => {}));
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
  const { prep, clock } = preparer(() => answers.shift());
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
  const answers = [late.promise, new Promise(() => {})];
  const { prep, clock } = preparer(() => answers.shift());
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
  const { prep, clock } = preparer(async () => Promise.reject(new Error('not allowed')));
  await assert.rejects(prep.prepare(), { message: 'not allowed' });
  assert.equal(clock.pending.size, 0);
});

function hungPlayer(resume) {
  const clock = fakeClock();
  const calls = [];
  const posted = [];
  const repl = {
    scheduler: { now: () => 0, cps: 0.5 },
    evaluate: async (code) => {
      if (code === 'bad') throw new Error('bad code');
      return { code };
    },
    start: async () => void calls.push('start'),
    stop: () => void calls.push('stop'),
  };
  const audio = {
    getAudioContext: () => ({ resume }),
    initAudio: async () => {},
    samples: async () => {},
  };
  const timers = { ...clock, setInterval: () => 1, clearInterval: () => {} };
  const player = createPlayer({ repl, audio, post: (message) => posted.push(message), timers });
  return { player, clock, calls, posted };
}

const LOAD = JSON.stringify({ type: 'load', code: 's("bd")' });
const PLAY = JSON.stringify({ type: 'play' });

test('Page: an audio start that hangs posts one error at the limit and nothing plays', async () => {
  const late = deferred();
  const { player, clock, calls, posted } = hungPlayer(() => late.promise);
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
  const { player, clock, calls, posted } = hungPlayer(() => new Promise(() => {}));
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  await player.handle(JSON.stringify({ type: 'stop' }));
  await playing;
  clock.advance(RESUME_LIMIT_MS);
  await settle();
  assert.deepEqual(posted, []);
  assert.equal(clock.pending.size, 0);
  assert.ok(!calls.includes('start'));
});

test('Page: a play abandoned by a failed load does not report the audio limit', async () => {
  const { player, clock, calls, posted } = hungPlayer(() => new Promise(() => {}));
  await player.handle(LOAD);
  const playing = player.handle(PLAY);
  await settle();
  await player.handle(JSON.stringify({ type: 'load', code: 'bad' }));
  clock.advance(RESUME_LIMIT_MS);
  await playing;
  assert.deepEqual(posted, [{ type: 'error', message: 'bad code' }]);
  assert.ok(!calls.includes('start'));
});
