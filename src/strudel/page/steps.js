// The step the learner hears, for the page's beat grid: the arithmetic from Strudel's clock and
// the ticker that posts it. player.js uses it; scripts/build-strudel.mjs bundles both into the
// page, and scripts/__tests__/player.test.mjs tests them under Node.

/**
 * @typedef {{ now(): number, cps: number }} Scheduler
 * @typedef {{ type: 'step', step: number }} StepMessage
 * @typedef {{ setInterval(fn: () => void, ms: number): unknown,
 *   clearInterval(id: unknown): void }} Timers
 */

const STEPS_PER_CYCLE = 16;
const STEP_EPSILON = 1e-9;
/** How often the page reads the scheduler's clock while playing, in milliseconds. */
const STEP_POLL_MS = 25;
/**
 * @strudel/web 1.3.0's scheduler (the Cyclist) reports a cycle position 0.05 s ahead of what is
 * heard: its clock ticks every 0.05 s and each sound is scheduled 0.1 s after its tick.
 */
const SCHEDULER_LEAD_SECONDS = 0.05;

/**
 * The 16th step being heard, 0 to 15, from the scheduler's cycle position; null before the
 * first sound, and for a clock value that is not a finite number.
 * @param {number} cycle
 * @param {number} cps cycles per second
 * @returns {number | null}
 */
export function stepOf(cycle, cps) {
  const heard = cycle - SCHEDULER_LEAD_SECONDS * cps;
  if (!Number.isFinite(heard) || heard < -STEP_EPSILON) return null;
  // The epsilon keeps a position that floating point puts just below a step boundary on that step.
  return Math.floor(((heard + STEP_EPSILON) % 1) * STEPS_PER_CYCLE);
}

/**
 * Posts the step being heard while playing, once per step.
 * @param {{ scheduler: Scheduler, post: (message: StepMessage) => void, timers: Timers }} options
 */
export function createTicker({ scheduler, post, timers }) {
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
