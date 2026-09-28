// The page inside the hidden WebView that plays the learner's Strudel code. scripts/build-strudel.mjs
// bundles this file with @strudel/web into the page (index.html); the tests in
// scripts/__tests__/player.test.mjs import it directly, with fakes for everything it talks to.
// It runs in WKWebView (iOS 17 and later), so it uses nothing newer than Safari 17 has.
//
// Message contract (Task 25 types it in src/strudel/bridge.ts). Each message is a JSON string.
//   App to page: {type:'load', code}, {type:'play'}, {type:'stop'}
//   Page to app: {type:'ready'}, {type:'error', message}, {type:'step', step}, {type:'needsNetwork'}

/**
 * @typedef {{ type: 'load', code: string } | { type: 'play' } | { type: 'stop' }} ToPage
 * @typedef {{ type: 'ready' } | { type: 'error', message: string } | { type: 'step', step: number }
 *   | { type: 'needsNetwork' }} FromPage
 * @typedef {(message: FromPage) => void} Post
 * @typedef {{ now(): number, cps: number }} Scheduler
 * @typedef {{ evaluate(code: string, autoplay: boolean): Promise<unknown>,
 *   start(): Promise<void> | void, stop(): void, scheduler: Scheduler }} Repl
 * @typedef {{ initAudio(): Promise<void>, samples(map: string): Promise<unknown> }} Audio
 * @typedef {{ setInterval(fn: () => void, ms: number): unknown,
 *   clearInterval(id: unknown): void }} Timers
 * @typedef {{ handle(raw: unknown): Promise<void>, reportError(error: unknown): void,
 *   onLog(detail: { message?: unknown } | undefined): void, onNetworkFailure(): void }} Player
 */

/** The longest code the page evaluates: the app's own limit for checkpoint code. */
export const MAX_CODE_LENGTH = 5000;
const MAX_ERROR_LENGTH = 500;
/** An error message never repeats the learner's code once it is at least this long. */
const MIN_REDACTED_CODE_LENGTH = 8;
const STEPS_PER_CYCLE = 16;
const STEP_EPSILON = 1e-9;
/** How often the page reads the scheduler's clock while playing, in milliseconds. */
const STEP_POLL_MS = 25;
/**
 * @strudel/web 1.3.0's scheduler (the Cyclist) reports a cycle position 0.05 s ahead of what is
 * heard: its clock ticks every 0.05 s and each sound is scheduled 0.1 s after its tick.
 */
const SCHEDULER_LEAD_SECONDS = 0.05;
/** The sample map loaded on the first play. Every URL in it is on raw.githubusercontent.com. */
export const SAMPLE_MAP = 'github:tidalcycles/dirt-samples';
/** How @strudel/web 1.3.0 logs an error thrown while the scheduler queries the pattern. */
const SCHEDULER_ERROR_PREFIX = '[cyclist] error: ';

/**
 * Reads one message from the app. Anything that is not a known message gives null.
 * @param {unknown} raw
 * @returns {ToPage | null}
 */
export function parseMessage(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  if (value.type === 'play' || value.type === 'stop') return { type: value.type };
  if (value.type === 'load' && typeof value.code === 'string') {
    return { type: 'load', code: value.code };
  }
  return null;
}

/**
 * Posts to the app through react-native-webview's bridge. Opened in a desktop browser for
 * debugging, the page has no bridge and posting does nothing.
 * @param {{ ReactNativeWebView?: { postMessage(raw: string): void } }} win
 * @returns {Post}
 */
export function createPoster(win) {
  return (message) => {
    const bridge = win.ReactNativeWebView;
    if (bridge) bridge.postMessage(JSON.stringify(message));
  };
}

/**
 * The text of an error, cut to 500 characters, with the learner's code taken out.
 * @param {unknown} error
 * @param {string} code
 */
export function errorText(error, code) {
  const text = error instanceof Error ? error.message : String(error);
  const redacted = code.length >= MIN_REDACTED_CODE_LENGTH ? text.split(code).join('<code>') : text;
  return redacted.slice(0, MAX_ERROR_LENGTH);
}

/**
 * The 16th step being heard, 0 to 15, from the scheduler's cycle position; null before the
 * first sound.
 * @param {number} cycle
 * @param {number} cps cycles per second
 * @returns {number | null}
 */
export function stepOf(cycle, cps) {
  const heard = cycle - SCHEDULER_LEAD_SECONDS * cps;
  if (!(heard >= -STEP_EPSILON)) return null;
  // The epsilon keeps a position that floating point puts just below a step boundary on that step.
  return Math.floor(((heard + STEP_EPSILON) % 1) * STEPS_PER_CYCLE);
}

/**
 * Wraps fetch to call onFailure when a request fails or is refused. Every request this page
 * makes loads samples, so a failure means the samples are unavailable.
 * @param {typeof fetch} fetchImpl
 * @param {() => void} onFailure
 * @returns {typeof fetch}
 */
export function watchFetch(fetchImpl, onFailure) {
  return async (input, init) => {
    try {
      const response = await fetchImpl(input, init);
      if (!response.ok) onFailure();
      return response;
    } catch (error) {
      onFailure();
      throw error;
    }
  };
}

/**
 * Posts the step being heard while playing, once per step.
 * @param {{ scheduler: Scheduler, post: Post, timers: Timers }} options
 */
function createTicker({ scheduler, post, timers }) {
  /** @type {unknown} */
  let id;
  /** @type {number | null} */
  let last = null;
  const tick = () => {
    const step = stepOf(scheduler.now(), scheduler.cps);
    if (step === null || step === last) return;
    last = step;
    post({ type: 'step', step });
  };
  const stop = () => {
    if (id !== undefined) timers.clearInterval(id);
    id = undefined;
    last = null;
  };
  const start = () => {
    stop();
    id = timers.setInterval(tick, STEP_POLL_MS);
  };
  return { start, stop };
}

/**
 * Starts Web Audio and loads the sample map, each until it succeeds once: @strudel/web's
 * initAudio adds its AudioWorklet modules again on every call. A sample map that fails to load
 * calls onNetworkFailure, and playback goes on without samples.
 * @param {Audio} audio
 * @param {() => void} onNetworkFailure
 */
function createAudioPreparer(audio, onNetworkFailure) {
  const done = { audio: false, samples: false };
  return async () => {
    if (!done.audio) {
      await audio.initAudio();
      done.audio = true;
    }
    if (done.samples) return;
    try {
      await audio.samples(SAMPLE_MAP);
      done.samples = true;
    } catch {
      onNetworkFailure();
    }
  };
}

/**
 * The page's message handling.
 * @param {{ repl: Repl, audio: Audio, post: Post, timers: Timers }} options
 * @returns {Player}
 */
export function createPlayer({ repl, audio, post, timers }) {
  const ticker = createTicker({ scheduler: repl.scheduler, post, timers });
  const state = {
    code: '',
    loaded: Promise.resolve(false),
    run: 0,
    playing: false,
    net: false,
  };

  /** @param {unknown} error */
  const reportError = (error) => {
    post({ type: 'error', message: errorText(error, state.code) });
  };
  const onNetworkFailure = () => {
    if (state.net) return;
    state.net = true;
    post({ type: 'needsNetwork' });
  };
  const stop = () => {
    state.run += 1;
    state.playing = false;
    ticker.stop();
    repl.stop();
  };
  // After a failed load nothing may keep playing: the app treats an error as stopped.
  const cancel = () => {
    if (state.playing) stop();
    else state.run += 1;
  };

  /** @param {string} code */
  const evaluate = async (code) => {
    try {
      return (await repl.evaluate(code, false)) !== undefined;
    } catch (error) {
      reportError(error);
      return false;
    }
  };
  /** @param {string} code */
  const load = (code) => {
    state.code = code;
    if (code.length > MAX_CODE_LENGTH) {
      post({ type: 'error', message: `Code is longer than ${MAX_CODE_LENGTH} characters.` });
      state.loaded = Promise.resolve(false);
    } else {
      state.loaded = evaluate(code);
    }
    return state.loaded.then((ok) => {
      if (!ok) cancel();
    });
  };

  const prepareAudio = createAudioPreparer(audio, () => onNetworkFailure());
  const play = async () => {
    const run = (state.run += 1);
    if (!(await state.loaded) || run !== state.run) return;
    state.net = false;
    try {
      await prepareAudio();
      if (run !== state.run) return;
      repl.stop();
      await repl.start();
      ticker.start();
      state.playing = true;
    } catch (error) {
      reportError(error);
    }
  };

  /** @param {unknown} raw */
  const handle = async (raw) => {
    const message = parseMessage(raw);
    if (message === null) return;
    if (message.type === 'load') return load(message.code);
    if (message.type === 'play') return play();
    stop();
  };
  /** @param {{ message?: unknown } | undefined} detail */
  const onLog = (detail) => {
    const message = detail?.message;
    if (typeof message !== 'string' || !message.startsWith(SCHEDULER_ERROR_PREFIX)) return;
    stop();
    reportError(message.slice(SCHEDULER_ERROR_PREFIX.length));
  };
  return { handle, reportError, onLog, onNetworkFailure };
}

/**
 * Wires the page to the real window and Strudel: starts Strudel, posts ready once it has
 * initialized, then handles the app's messages. If Strudel fails to start, the page stays
 * silent and the app gives up waiting for ready.
 * @param {Window & Timers & { ReactNativeWebView?: { postMessage(raw: string): void } }} win
 * @param {Audio & { initStrudel(options: { onEvalError(error: unknown): void }): Promise<Repl> }} strudel
 */
export async function startPage(win, strudel) {
  const post = createPoster(win);
  /** @type {Player | undefined} */
  let player;
  win.fetch = watchFetch(win.fetch.bind(win), () => player?.onNetworkFailure());
  let repl;
  try {
    repl = await strudel.initStrudel({ onEvalError: (error) => player?.reportError(error) });
  } catch {
    return;
  }
  const ready = createPlayer({ repl, audio: strudel, post, timers: win });
  player = ready;
  win.addEventListener('message', (event) => ready.handle(event.data));
  win.document.addEventListener('strudel.log', (event) => ready.onLog(event.detail));
  post({ type: 'ready' });
}
