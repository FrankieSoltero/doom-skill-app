// Starting Web Audio for the page: resuming the audio context and loading the sample map, each
// within a time limit, and starting Strudel's audio. player.js uses it; scripts/build-strudel.mjs
// bundles it into the page, and scripts/__tests__/audio.test.mjs and samples.test.mjs test it
// under Node.

/**
 * @typedef {{ initAudio(): Promise<void>, samples(map: string): Promise<unknown>,
 *   getAudioContext(): { resume(): Promise<void> } }} Audio
 * @typedef {{ setTimeout(fn: () => void, ms: number): unknown,
 *   clearTimeout(id: unknown): void }} Timeouts
 */

/** The sample map, loaded once, from the first play on. Every URL in it is on raw.githubusercontent.com. */
export const SAMPLE_MAP = 'github:tidalcycles/dirt-samples';
/**
 * How long a play waits for the audio context to resume. An audio-session interruption (a phone
 * call, the app in the background) can leave resume() unsettled, and the app would stay "playing".
 */
export const RESUME_LIMIT_MS = 3000;
/**
 * How long a play waits for the sample map. A request that never answers (a captive portal, a
 * stalled connection) leaves samples() unsettled, and the play would never start. At the limit
 * the play goes on without samples and reports needsNetwork; the load goes on, for a later play.
 */
export const SAMPLES_LIMIT_MS = 5000;
/** The error a play posts when the audio context has not resumed within the limit. */
export const AUDIO_DID_NOT_START = 'Audio did not start';

const CANCELLED = Symbol('cancelled');
const TIMED_OUT = Symbol('timed out');

/**
 * One wait at a time for work that may never settle, racing a time limit. `wait` resolves to the
 * work's value when it resolves first, TIMED_OUT at the limit, and CANCELLED when `cancel` or a
 * newer wait ended it; it rejects when the work rejects first. Work that settles after its wait
 * has ended changes nothing, and its rejection is handled.
 * @param {Timeouts} timers
 */
function createWaiter(timers) {
  /** @type {{ id: unknown, end(): void } | undefined} */
  let waiting;
  const cancel = () => {
    const current = waiting;
    waiting = undefined;
    if (current === undefined) return;
    timers.clearTimeout(current.id);
    current.end();
  };
  /**
   * @param {() => Promise<unknown>} work
   * @param {number} limitMs
   * @returns {Promise<unknown>}
   */
  const wait = (work, limitMs) =>
    new Promise((resolve, reject) => {
      cancel();
      const entry = { id: undefined, end: () => resolve(CANCELLED) };
      /** @param {() => void} settle */
      const once = (settle) => () => {
        if (waiting !== entry) return;
        waiting = undefined;
        timers.clearTimeout(entry.id);
        settle();
      };
      waiting = entry;
      entry.id = timers.setTimeout(
        once(() => resolve(TIMED_OUT)),
        limitMs,
      );
      Promise.resolve()
        .then(work)
        .then(
          (value) => once(() => resolve(value))(),
          (error) => once(() => reject(error))(),
        );
    });
  return { wait, cancel };
}

/**
 * Loads the sample map until it succeeds once. @strudel/web 1.3.0's samples() keeps nothing
 * between calls: each call fetches the map again, with no time limit (`O2` and `XS`,
 * dist/index.mjs lines 7757-7790). So the page keeps the load under way and every play waits on
 * that one load; a failed load is dropped, and the next play downloads the map again. `load`
 * resolves true once loaded and false when the load failed; it never rejects.
 * @param {Audio} audio
 */
function createSampleLoader(audio) {
  const state = { loaded: false, /** @type {Promise<boolean> | undefined} */ loading: undefined };
  const load = () => {
    if (state.loading === undefined) {
      state.loading = Promise.resolve()
        .then(() => audio.samples(SAMPLE_MAP))
        .then(
          () => (state.loaded = true),
          () => {
            state.loading = undefined;
            return false;
          },
        );
    }
    return state.loading;
  };
  return { load, isLoaded: () => state.loaded };
}

/**
 * Starts Web Audio and loads the sample map. It resumes the audio context on every play, which
 * the app sends from the learner's tap: @strudel/web 1.3.0's initAudio never does, because its
 * `!r instanceof OfflineAudioContext && await r.resume()` reads as `(!r) instanceof ...`, which is
 * always false (dist/index.mjs line 8320). initAudio runs until it succeeds once: it adds its
 * AudioWorklet modules again on every call. A sample map that fails to load, or has not loaded
 * within the limit, calls onNetworkFailure, and playback goes on without samples.
 * `prepare` resolves true when playback may start, false when it was cancelled; it rejects when
 * the audio context did not resume. `cancel` ends a prepare's wait (on stop, and by a newer
 * prepare), and a prepare that a newer one replaced starts no wait of its own.
 * @param {{ audio: Audio, onNetworkFailure: () => void, timers: Timeouts }} options
 */
export function createAudioPreparer({ audio, onNetworkFailure, timers }) {
  const waiter = createWaiter(timers);
  const sampleMap = createSampleLoader(audio);
  const state = { audio: false, run: 0 };
  const resume = async () => {
    const outcome = await waiter.wait(() => audio.getAudioContext().resume(), RESUME_LIMIT_MS);
    if (outcome === TIMED_OUT) throw new Error(AUDIO_DID_NOT_START);
    return outcome !== CANCELLED;
  };
  const loadSamples = async () => {
    const outcome = await waiter.wait(sampleMap.load, SAMPLES_LIMIT_MS);
    if (outcome === CANCELLED) return false;
    if (outcome !== true) onNetworkFailure();
    return true;
  };
  const prepare = async () => {
    const run = (state.run += 1);
    if (!(await resume())) return false;
    if (!state.audio) {
      await audio.initAudio();
      state.audio = true;
    }
    // A stop or a newer play came while initAudio ran: that play's wait must not be ended here.
    if (run !== state.run) return false;
    return sampleMap.isLoaded() || loadSamples();
  };
  const cancel = () => {
    state.run += 1;
    waiter.cancel();
  };
  return { prepare, cancel };
}
