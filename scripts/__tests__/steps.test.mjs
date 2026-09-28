// Tests for the page's step arithmetic and ticker (src/strudel/page/steps.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTicker, stepOf } from '../../src/strudel/page/steps.js';

test('stepOf maps the heard cycle position to a 16th step, 0 to 15', () => {
  // The scheduler runs 0.05 s ahead of what is heard; at 0.5 cycles per second that is 0.025.
  assert.equal(stepOf(0.025, 0.5), 0);
  assert.equal(stepOf(0.025 + 1 / 16, 0.5), 1);
  assert.equal(stepOf(0.024, 0.5), null);
  assert.equal(stepOf(3.025 + 15.9 / 16, 0.5), 15);
});

test('stepOf gives null for a clock value that is not finite', () => {
  for (const cycle of [Infinity, -Infinity, Number.NaN]) assert.equal(stepOf(cycle, 0.5), null);
  // setcps(1e308): the lead alone overflows to Infinity.
  assert.equal(stepOf(1, Number.MAX_VALUE * 100), null);
  assert.equal(stepOf(1, Number.NaN), null);
});

test('the ticker posts nothing while the clock is not finite', () => {
  const posted = [];
  const scheduler = { cps: 0.5, value: Infinity, now: () => scheduler.value };
  let tick = () => {};
  const timers = { setInterval: (fn) => ((tick = fn), 1), clearInterval: () => {} };
  const ticker = createTicker({ scheduler, post: (message) => posted.push(message), timers });
  ticker.start();
  for (const value of [Infinity, -Infinity, Number.NaN, Infinity]) {
    scheduler.value = value;
    tick();
  }
  assert.deepEqual(posted, []);
  scheduler.value = 0.025;
  tick();
  assert.deepEqual(posted, [{ type: 'step', step: 0 }]);
});
