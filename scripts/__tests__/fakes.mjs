// Fakes shared by the page's tests: a clock whose timeouts run only when a test moves it on,
// Strudel's audio functions and REPL, and a REPL that runs snippets in a window. Not a test file
// itself: the Node test glob is scripts/__tests__/*.test.mjs.
import vm from 'node:vm';

import { createAudioPreparer } from '../../src/strudel/page/audio.js';
import { createPlayer } from '../../src/strudel/page/player.js';

/** Lets pending promise callbacks run. */
export const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A promise with its resolve and reject exposed. */
export function deferred() {
  const handle = {};
  handle.promise = new Promise((resolve, reject) => Object.assign(handle, { resolve, reject }));
  return handle;
}

/** A promise that never settles. */
export const never = () => new Promise(() => {});

/** Timeouts that run only when the test moves the clock on. */
export function fakeClock() {
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

/** Records how a promise ended, without awaiting it. */
export function track(promise) {
  const outcome = { state: 'pending' };
  promise.then(
    (value) => Object.assign(outcome, { state: 'resolved', value }),
    (error) => Object.assign(outcome, { state: 'rejected', error }),
  );
  return outcome;
}

/**
 * Strudel's audio functions. `resume` and `samples` give each call's answer; every call is
 * recorded in `log`.
 */
function fakeAudio({ resume, samples, initAudio }) {
  const log = [];
  const audio = {
    getAudioContext: () => ({ resume: () => (log.push('resume'), resume()) }),
    initAudio: () => (log.push('initAudio'), initAudio()),
    samples: (map) => (log.push('samples'), samples(map)),
  };
  return { audio, log };
}

const resolved = async () => {};

/** The audio preparer on fakes. `failures` counts its onNetworkFailure calls. */
export function preparer({ resume = resolved, samples = resolved, initAudio = resolved } = {}) {
  const clock = fakeClock();
  const { audio, log } = fakeAudio({ resume, samples, initAudio });
  const failures = { count: 0 };
  const onNetworkFailure = () => void (failures.count += 1);
  const prep = createAudioPreparer({ audio, onNetworkFailure, timers: clock });
  return { prep, clock, log, failures };
}

/**
 * The player on fakes, with the fake clock for its timeouts. `calls` records the REPL's start
 * and stop; `tick` runs the step ticker once; the scheduler is at step 0 of the heard cycle.
 */
export function fakePlayer({ resume = resolved, samples = resolved } = {}) {
  const clock = fakeClock();
  const calls = [];
  const posted = [];
  const repl = {
    scheduler: { now: () => 0.025, cps: 0.5 },
    evaluate: async (code) => {
      if (code === 'bad') throw new Error('bad code');
      return { code };
    },
    start: async () => void calls.push('start'),
    stop: () => void calls.push('stop'),
  };
  const { audio } = fakeAudio({ resume, samples, initAudio: resolved });
  const ticker = { run: () => {} };
  const timers = {
    ...clock,
    setInterval: (fn) => ((ticker.run = fn), 1),
    clearInterval: () => void (ticker.run = () => {}),
  };
  const player = createPlayer({ repl, audio, post: (message) => posted.push(message), timers });
  return { player, clock, calls, posted, tick: () => ticker.run() };
}

/**
 * A REPL that runs a snippet as Strudel's does: as script in the page's global scope (`win`),
 * reporting a throw through onEvalError and resolving to undefined.
 */
export function snippetRepl(win, onEvalError) {
  const context = vm.createContext(win);
  return {
    scheduler: { now: () => 0, cps: 0.5 },
    evaluate: async (code) => {
      try {
        return vm.runInContext(code, context) ?? {};
      } catch (error) {
        onEvalError(error);
        return undefined;
      }
    },
    start: async () => {},
    stop: () => {},
  };
}

export const LOAD = JSON.stringify({ type: 'load', code: 's("bd")' });
export const PLAY = JSON.stringify({ type: 'play' });
export const STOP = JSON.stringify({ type: 'stop' });
