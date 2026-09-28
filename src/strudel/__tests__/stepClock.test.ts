import { motion } from '../../theme';
import { StepClock } from '../stepClock';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function startClock() {
  const onStep = jest.fn<undefined, [number]>();
  const clock = new StepClock(onStep);
  clock.start();
  const steps = () => onStep.mock.calls.map(([step]) => step);
  return { clock, steps };
}

describe('StepClock', () => {
  it('reports step 0 at once, then the next step every beat step', () => {
    const { steps } = startClock();
    expect(steps()).toStrictEqual([0]);
    jest.advanceTimersByTime(motion.beatStep - 1);
    expect(steps()).toStrictEqual([0]);
    jest.advanceTimersByTime(1);
    expect(steps()).toStrictEqual([0, 1]);
  });

  it('goes from 15 back to 0', () => {
    const { steps } = startClock();
    jest.advanceTimersByTime(motion.beatStep * 17);
    expect(steps()).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1]);
  });

  it('is running from start to stop, and stop clears its timer', () => {
    const before = jest.getTimerCount();
    const { clock, steps } = startClock();
    expect(clock.running).toBe(true);
    expect(jest.getTimerCount()).toBe(before + 1);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(jest.getTimerCount()).toBe(before);
    jest.advanceTimersByTime(motion.beatStep * 3);
    expect(steps()).toStrictEqual([0]);
    clock.stop();
    expect(clock.running).toBe(false);
  });

  it('starts again from 0 with one timer', () => {
    const before = jest.getTimerCount();
    const { clock, steps } = startClock();
    jest.advanceTimersByTime(motion.beatStep * 5);
    clock.start();
    expect(jest.getTimerCount()).toBe(before + 1);
    expect(steps().at(-1)).toBe(0);
    jest.advanceTimersByTime(motion.beatStep);
    expect(steps().at(-1)).toBe(1);
  });
});
