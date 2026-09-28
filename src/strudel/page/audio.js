// Starting Web Audio for the page: resuming the audio context within a time limit, starting
// Strudel's audio and loading the sample map. player.js uses it; scripts/build-strudel.mjs bundles
// it into the page, and scripts/__tests__/audio.test.mjs tests it under Node.

/**
 * @typedef {{ initAudio(): Promise<void>, samples(map: string): Promise<unknown>,
 *   getAudioContext(): { resume(): Promise<void> } }} Audio
 * @typedef {{ setTimeout(fn: () => void, ms: number): unknown,
 *   clearTimeout(id: unknown): void }} Timeouts
 */

/** The sample map loaded on the first play. Every URL in it is on raw.githubusercontent.com. */
export const SAMPLE_MAP = 'github:tidalcycles/dirt-samples';
/**
 * How long a play waits for the audio context to resume. An audio-session interruption (a phone
 * call, the app in the background) can leave resume() unsettled, and the app would stay "playing".
 */
export const RESUME_LIMIT_MS = 3000;
/** The error a play posts when the audio context has not resumed within the limit. */
export const AUDIO_DID_NOT_START = 'Audio did not start';

/**
 * Resumes the audio context, racing the time limit. Resolves true when it resumed, false when
 * `cancel` or a newer call ended the wait; rejects at the limit or when resume() rejects. A
 * resume() that settles after the wait has ended changes nothing.
 * @param {Audio} audio
 * @param {Timeouts} timers
 */
function createResumer(audio, timers) {
  /** @type {{ id: unknown, end(): void } | undefined} */
  let waiting;
  const cancel = () => {
    const current = waiting;
    waiting = undefined;
    if (current === undefined) return;
    timers.clearTimeout(current.id);
    current.end();
  };
  /** @returns {Promise<boolean>} */
  const resume = () =>
    new Promise((resolve, reject) => {
      cancel();
      const entry = { id: undefined, end: () => resolve(false) };
      /** @param {() => void} settle */
      const once = (settle) => () => {
        if (waiting !== entry) return;
        waiting = undefined;
        timers.clearTimeout(entry.id);
        settle();
      };
      waiting = entry;
      entry.id = timers.setTimeout(
        once(() => reject(new Error(AUDIO_DID_NOT_START))),
        RESUME_LIMIT_MS,
      );
      Promise.resolve()
        .then(() => audio.getAudioContext().resume())
        .then(
          once(() => resolve(true)),
          (error) => once(() => reject(error))(),
        );
    });
  return { resume, cancel };
}

/**
 * Starts Web Audio and loads the sample map. It resumes the audio context on every play, which
 * the app sends from the learner's tap: @strudel/web 1.3.0's initAudio never does, because its
 * `!r instanceof OfflineAudioContext && await r.resume()` reads as `(!r) instanceof ...`, which is
 * always false (dist/index.mjs line 8320). initAudio and the sample map run until each succeeds
 * once: initAudio adds its AudioWorklet modules again on every call. A sample map that fails to
 * load calls onNetworkFailure, and playback goes on without samples.
 * `prepare` resolves true when playback may start, false when the wait was cancelled; `cancel`
 * ends a wait for the audio context (on stop, and by a newer prepare).
 * @param {{ audio: Audio, onNetworkFailure: () => void, timers: Timeouts }} options
 */
export function createAudioPreparer({ audio, onNetworkFailure, timers }) {
  const resumer = createResumer(audio, timers);
  const done = { audio: false, samples: false };
  const prepare = async () => {
    if (!(await resumer.resume())) return false;
    if (!done.audio) {
      await audio.initAudio();
      done.audio = true;
    }
    if (done.samples) return true;
    try {
      await audio.samples(SAMPLE_MAP);
      done.samples = true;
    } catch {
      onNetworkFailure();
    }
    return true;
  };
  return { prepare, cancel: resumer.cancel };
}
