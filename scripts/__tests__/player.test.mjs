// Tests for the page that runs inside the hidden WebView (src/strudel/page/player.js). The page's
// collaborators (Strudel's REPL and audio functions, the post function, the timers, the window)
// are fakes here, so every "Page:" row of the Task 24 brief runs under `node --test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_CODE_LENGTH,
  SAMPLE_MAP,
  createPlayer,
  createPoster,
  errorText,
  parseMessage,
  startPage,
  watchFetch,
} from '../../src/strudel/page/player.js';

const load = (code) => JSON.stringify({ type: 'load', code });
const PLAY = JSON.stringify({ type: 'play' });
const STOP = JSON.stringify({ type: 'stop' });

// A REPL that behaves like @strudel/web 1.3.0's: `evaluate` reports an evaluation error through
// `onEvalError` and resolves to undefined; an empty string rejects.
function fakeRepl(onEvalError) {
  const calls = [];
  const repl = {
    calls,
    scheduler: { cycle: 0, cps: 0.5, now: () => repl.scheduler.cycle },
    evaluate: async (code, autoplay) => {
      calls.push(['evaluate', code, autoplay]);
      if (code === '') throw new Error('no code to evaluate');
      if (!code.startsWith('bad')) return { pattern: code };
      onEvalError(new SyntaxError(`Unexpected token in ${code}`));
      return undefined;
    },
    start: async () => void calls.push(['start']),
    stop: () => void calls.push(['stop']),
  };
  return repl;
}

function fakeTimers() {
  const timers = { tick: undefined, cleared: 0 };
  timers.setInterval = (fn) => ((timers.tick = fn), 7);
  timers.clearInterval = (id) => {
    assert.equal(id, 7);
    timers.tick = undefined;
    timers.cleared += 1;
  };
  return timers;
}

// `resume` records itself in the REPL's calls, so a test can check it comes before `start`.
function setup({ samples = async () => {}, resume = async () => {} } = {}) {
  const posted = [];
  const timers = fakeTimers();
  let player;
  const repl = fakeRepl((error) => player.reportError(error));
  const context = { resume: () => (repl.calls.push(['resume']), resume()) };
  const audio = {
    starts: 0,
    initAudio: async () => void (audio.starts += 1),
    getAudioContext: () => context,
    samples,
  };
  player = createPlayer({ repl, audio, post: (message) => posted.push(message), timers });
  return { player, repl, audio, timers, posted };
}

test('parseMessage accepts the three app messages', () => {
  assert.deepEqual(parseMessage(load('s("bd")')), { type: 'load', code: 's("bd")' });
  assert.deepEqual(parseMessage(PLAY), { type: 'play' });
  assert.deepEqual(parseMessage(STOP), { type: 'stop' });
});

test('Page: unknown message is ignored without throwing', async () => {
  const { player, repl, posted } = setup();
  const junk = ['not json', '5', 'null', '[]', '"play"', '{"type":"code","code":"x"}'];
  const badLoad = ['{"type":"load"}', '{"type":"load","code":5}', '{"type":"load","code":null}'];
  for (const raw of [...junk, ...badLoad, undefined, { type: 'play' }]) {
    assert.equal(parseMessage(raw), null);
    await player.handle(raw);
  }
  assert.deepEqual(repl.calls, []);
  assert.deepEqual(posted, []);
});

test('Page: load evaluates the code without starting playback', async () => {
  const { player, repl, posted } = setup();
  await player.handle(load('s("bd sd")'));
  assert.deepEqual(repl.calls, [['evaluate', 's("bd sd")', false]]);
  assert.deepEqual(posted, []);
});

test('Page: load posts an error for a syntax or runtime error', async () => {
  const { player, posted } = setup();
  await player.handle(load('bad('));
  await player.handle(load(''));
  assert.deepEqual(posted, [
    { type: 'error', message: 'Unexpected token in bad(' },
    { type: 'error', message: 'no code to evaluate' },
  ]);
});

test('Page: a load that fails while playing stops playback and step messages', async () => {
  const { player, repl, timers } = setup();
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  await player.handle(load('bad'));
  assert.deepEqual(repl.calls.at(-1), ['stop']);
  assert.equal(timers.tick, undefined);
  await player.handle(load('s("sd")'));
  assert.deepEqual(repl.calls.at(-1), ['evaluate', 's("sd")', false]);
});

test('Page: load refuses code over the length limit', async () => {
  const { player, repl, posted } = setup();
  await player.handle(load('x'.repeat(MAX_CODE_LENGTH + 1)));
  assert.deepEqual(repl.calls, []);
  assert.deepEqual(posted, [{ type: 'error', message: 'Code is longer than 5000 characters.' }]);
  await player.handle(load('x'.repeat(MAX_CODE_LENGTH)));
  assert.equal(repl.calls.length, 1);
});

test('errorText cuts the message to 500 characters and never echoes the whole code', () => {
  assert.equal(errorText(new Error('y'.repeat(900)), '').length, 500);
  const code = 'note("c3 e3 g3").sound("piano")';
  assert.equal(errorText(new Error(`bad: ${code}!`), code), 'bad: <code>!');
  assert.equal(errorText('plain', code), 'plain');
  assert.equal(errorText(new Error('sound s not found'), 's'), 'sound s not found');
});

test('Page: play after a load starts playback and posts each 16th step', async () => {
  const { player, repl, timers, posted } = setup();
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  assert.deepEqual(repl.calls.slice(1), [['resume'], ['stop'], ['start']]);
  const steps = [];
  for (let cycle = 0.025; cycle < 1.025; cycle += 1 / 64) {
    repl.scheduler.cycle = cycle;
    timers.tick();
  }
  for (const message of posted) steps.push(message.step);
  assert.deepEqual(steps, [...Array(16).keys()]);
  assert.ok(posted.every((message) => message.type === 'step'));
});

test('Page: play without a successful load does nothing', async () => {
  const { player, repl, timers } = setup();
  await player.handle(PLAY);
  await player.handle(load('bad'));
  await player.handle(PLAY);
  assert.deepEqual(repl.calls, [['evaluate', 'bad', false]]);
  assert.equal(timers.tick, undefined);
});

test('Page: stop stops playback and step messages', async () => {
  const { player, repl, timers, posted } = setup();
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  await player.handle(STOP);
  assert.deepEqual(repl.calls.at(-1), ['stop']);
  assert.equal(timers.tick, undefined);
  assert.equal(timers.cleared, 1);
  assert.deepEqual(posted, []);
});

test('Page: a stop that arrives while play is starting wins', async () => {
  const { player, repl, timers } = setup();
  await player.handle(load('s("bd")'));
  const playing = player.handle(PLAY);
  await player.handle(STOP);
  await playing;
  assert.ok(!repl.calls.some(([name]) => name === 'start'));
  assert.equal(timers.tick, undefined);
});

test('Page: samples unavailable posts needsNetwork once per play and still plays', async () => {
  const maps = [];
  const { player, repl, posted } = setup({
    samples: async (map) => {
      maps.push(map);
      player.onNetworkFailure();
      throw new Error('error loading "https://raw.githubusercontent.com/..."');
    },
  });
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  await player.handle(PLAY);
  assert.deepEqual(maps, [SAMPLE_MAP, SAMPLE_MAP]);
  assert.deepEqual(posted, [{ type: 'needsNetwork' }, { type: 'needsNetwork' }]);
  assert.equal(repl.calls.filter(([name]) => name === 'start').length, 2);
});

test('Page: samples unavailable when the sample map load only rejects', async () => {
  const { player, repl, posted } = setup({
    samples: async () => Promise.reject(new Error('error loading "strudel.json"')),
  });
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  assert.deepEqual(posted, [{ type: 'needsNetwork' }]);
  assert.deepEqual(repl.calls.at(-1), ['start']);
});

test('Page: play resumes the audio context on every play, before playback starts', async () => {
  const { player, repl } = setup();
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  await player.handle(PLAY);
  const names = repl.calls.map(([name]) => name);
  assert.deepEqual(names, ['evaluate', 'resume', 'stop', 'start', 'resume', 'stop', 'start']);
});

test('Page: a rejected resume posts one error and nothing plays', async () => {
  const { player, repl, timers, posted } = setup({
    resume: async () => Promise.reject(new Error('The operation is not allowed')),
  });
  await player.handle(load('s("bd")'));
  await assert.doesNotReject(player.handle(PLAY));
  assert.deepEqual(posted, [{ type: 'error', message: 'The operation is not allowed' }]);
  assert.ok(!repl.calls.some(([name]) => name === 'start'));
  assert.equal(timers.tick, undefined);
});

test('audio starts and the sample map loads once, after they succeed', async () => {
  let loads = 0;
  const { player, audio } = setup({ samples: async () => void (loads += 1) });
  await player.handle(load('s("bd")'));
  await player.handle(PLAY);
  await player.handle(PLAY);
  assert.equal(loads, 1);
  assert.equal(audio.starts, 1);
});

test('Page: a scheduler error stops playback and posts the error', async () => {
  const { player, repl, timers, posted } = setup();
  await player.handle(load('s("bd").fast(x)'));
  await player.handle(PLAY);
  player.onLog({ message: '[sampler] load sound "bd:0"..' });
  player.onLog({ message: '[cyclist] error: x is not defined' });
  assert.deepEqual(posted, [{ type: 'error', message: 'x is not defined' }]);
  assert.deepEqual(repl.calls.at(-1), ['stop']);
  assert.equal(timers.tick, undefined);
});

test('watchFetch reports a failed or refused request and passes the response on', async () => {
  let failures = 0;
  const onFailure = () => void (failures += 1);
  const ok = { ok: true };
  assert.equal(await watchFetch(async () => ok, onFailure)('u'), ok);
  assert.equal(failures, 0);
  await watchFetch(async () => ({ ok: false }), onFailure)('u');
  assert.equal(failures, 1);
  const offline = watchFetch(async () => Promise.reject(new TypeError('Load failed')), onFailure);
  await assert.rejects(offline('u'), /Load failed/);
  assert.equal(failures, 2);
});

test('createPoster posts JSON through ReactNativeWebView, and does nothing without it', () => {
  const sent = [];
  createPoster({ ReactNativeWebView: { postMessage: (raw) => sent.push(raw) } })({ type: 'ready' });
  assert.deepEqual(sent, ['{"type":"ready"}']);
  assert.doesNotThrow(() => createPoster({})({ type: 'ready' }));
});

function fakeWindow() {
  const listeners = {};
  const listen = (type, fn) => void (listeners[type] = fn);
  const sent = [];
  const win = {
    ...fakeTimers(),
    listeners,
    sent,
    addEventListener: listen,
    document: { addEventListener: listen },
    fetch: async () => ({ ok: false }),
    ReactNativeWebView: { postMessage: (raw) => sent.push(JSON.parse(raw)) },
  };
  return win;
}

test('Page: ready is posted once, after Strudel has initialized', async () => {
  const win = fakeWindow();
  let options;
  const strudel = {
    initStrudel: async (given) => ((options = given), fakeRepl(given.onEvalError)),
    initAudio: async () => {},
    samples: async () => {},
  };
  await startPage(win, strudel);
  assert.deepEqual(win.sent, [{ type: 'ready' }]);
  await win.listeners.message({ data: load('bad') });
  await win.fetch('https://raw.githubusercontent.com/x');
  win.listeners['strudel.log']({ detail: { message: '[cyclist] error: boom' } });
  assert.equal(typeof options.onEvalError, 'function');
  assert.deepEqual(win.sent.slice(1), [
    { type: 'error', message: 'Unexpected token in bad' },
    { type: 'needsNetwork' },
    { type: 'error', message: 'boom' },
  ]);
});

test('Page: no ready when Strudel fails to initialize', async () => {
  const win = fakeWindow();
  const strudel = { initStrudel: async () => Promise.reject(new Error('no audio')) };
  await startPage(win, strudel);
  assert.deepEqual(win.sent, []);
  assert.equal(win.listeners.message, undefined);
});
