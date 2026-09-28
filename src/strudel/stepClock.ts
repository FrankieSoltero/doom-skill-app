import { motion } from '../theme';

/** Steps in one cycle of the beat grid. */
const STEPS = 16;

/**
 * Counts the beat grid's steps, 0 to 15 and around, one every `motion.beatStep` ms. `useStrudel`
 * runs it while the page plays without samples and so cannot report the step itself.
 */
export class StepClock {
  private timer: ReturnType<typeof setInterval> | undefined;
  private step = 0;
  private readonly onStep: (step: number) => void;

  constructor(onStep: (step: number) => void) {
    this.onStep = onStep;
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  /** Reports step 0 now and counts on from there, replacing any count already running. */
  start(): void {
    this.stop();
    this.step = 0;
    this.onStep(this.step);
    this.timer = setInterval(() => {
      this.step = (this.step + 1) % STEPS;
      this.onStep(this.step);
    }, motion.beatStep);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
