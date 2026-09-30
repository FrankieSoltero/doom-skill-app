// Starting Web Audio for the page: resuming the audio context and loading the sample maps, each
// within a time limit, and starting Strudel's audio. player.js uses it; scripts/build-strudel.mjs
// bundles it into the page, and scripts/__tests__/audio.test.mjs and samples.test.mjs test it
// under Node.

/**
 * @typedef {{ initAudio(): Promise<void>, samples(map: string): Promise<unknown>,
 *   getAudioContext(): { resume(): Promise<void> } }} Audio
 * @typedef {{ setTimeout(fn: () => void, ms: number): unknown,
 *   clearTimeout(id: unknown): void }} Timeouts
 */

/** Where strudel.cc's default sample maps live (felixroos/dough-samples on GitHub). */
const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';

/**
 * The sample maps, each loaded once, from the first play on: the default maps strudel.cc loads
 * (the Strudel README: "the default sound banks" are the dough-samples repository), which give
 * card code the drum machines (`bank("RolandTR909")`), `piano`, the Dirt samples, the EMU SP-12,
 * VCSL's instruments and the mridangam; and first the map the page loaded before them,
 * `github:tidalcycles/dirt-samples`, which the bundled demo cards were written against. Every map
 * is on raw.githubusercontent.com, the one host the page's policy lets it fetch from; a sample a
 * map names on another host is refused, and the page reports needsNetwork.
 */
export const SAMPLE_MAPS = Object.freeze([
  'github:tidalcycles/dirt-samples',
  `${DOUGH}/tidal-drum-machines.json`,
  `${DOUGH}/piano.json`,
  `${DOUGH}/Dirt-Samples.json`,
  `${DOUGH}/EmuSP12.json`,
  `${DOUGH}/vcsl.json`,
  `${DOUGH}/mridangam.json`,
]);
/**
 * How long a play waits for the audio context to resume. An audio-session interruption (a phone
 * call, the app in the background) can leave resume() unsettled, and the app would stay "playing".
 */
export const RESUME_LIMIT_MS = 3000;
/**
 * How long a play waits for the sample maps. A request that never answers (a captive portal, a
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
 * Loads the sample maps until each has succeeded once. @strudel/web 1.3.0's samples() keeps
 * nothing between calls: each call fetches its map again, with no time limit (`O2` and `XS`,
 * dist/index.mjs lines 7757-7790). So the page keeps one load of the maps under way and every play
 * waits on that one load; the maps load side by side, each on its own. A map that failed is
 * dropped, and the next play downloads that map again, and only the maps not yet loaded. `load`
 * resolves true once every map has loaded and false when one failed; it never rejects.
 * @param {Audio} audio
 */
function createSampleLoader(audio) {
  /** @type {Set<string>} */
  const loaded = new Set();
  const state = { /** @type {Promise<boolean> | undefined} */ loading: undefined };
  /** @param {string} map */
  const loadOne = (map) =>
    Promise.resolve()
      .then(() => audio.samples(map))
      .then(
        () => (loaded.add(map), true),
        () => false,
      );
  const load = () => {
    if (state.loading === undefined) {
      const pending = SAMPLE_MAPS.filter((map) => !loaded.has(map));
      state.loading = Promise.all(pending.map(loadOne)).then((results) => {
        const done = results.every(Boolean);
        if (!done) state.loading = undefined;
        return done;
      });
    }
    return state.loading;
  };
  return { load, isLoaded: () => loaded.size === SAMPLE_MAPS.length };
}

/**
 * Starts Web Audio and loads the sample maps. It resumes the audio context on every play, which
 * the app sends from the learner's tap: @strudel/web 1.3.0's initAudio never does, because its
 * `!r instanceof OfflineAudioContext && await r.resume()` reads as `(!r) instanceof ...`, which is
 * always false (dist/index.mjs line 8320). initAudio runs until it succeeds once: it adds its
 * AudioWorklet modules again on every call. A sample map that fails to load, or maps not loaded
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
