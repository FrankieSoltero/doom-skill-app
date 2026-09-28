// Runs the Strudel code in the four demo sets through the repl of @strudel/web 1.3.0, the library
// the app's WebView page bundles, set up as the page's `initStrudel` sets it up, and queries the
// patterns for their events without audio. Every snippet, option, starter and stated solution must
// evaluate and play in its first cycle, and each answer a card gives must be what Strudel plays.
// Node's test runner, not Jest: every @strudel package ships only ES modules, which Jest here does
// not load. Strudel logs as it loads and on every evaluation, so it runs in a worker thread started
// from this file, whose output is captured and dropped.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';

/** The events of `pattern` that start from `from` up to `to`, in time order, as [start, value]. */
function onsets(pattern, from, to) {
  return pattern
    .queryArc(from, to)
    .filter((hap) => hap.hasOnset())
    .map((hap) => [hap.whole.begin.valueOf(), hap.value])
    .sort(([a], [b]) => a - b);
}

/** The worker: evaluates code in Strudel and answers with the events it plays, or its error. */
async function hostStrudel() {
  // The bundle adds listeners to `window` and `document` as it loads. Node has neither, so two
  // plain event targets stand in; nothing here dispatches to them.
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  const strudel = await import('@strudel/web/dist/index.mjs');
  // What `initStrudel` does before it makes the repl: every string is mini-notation, and every
  // Strudel function is in scope for the evaluated code.
  strudel.miniAllStrings();
  await strudel.evalScope(strudel);
  let evalError;
  const repl = strudel.webaudioRepl({
    // A stand-in audio context: nothing is played, the patterns are only queried.
    audioContext: { currentTime: 0 },
    transpiler: strudel.transpiler,
    onEvalError: (error) => {
      evalError = error;
    },
  });
  parentPort.on('message', async ({ id, code, from, to, notes }) => {
    if (notes) {
      parentPort.postMessage({ id, midi: notes.map((note) => strudel.noteToMidi(note)) });
      return;
    }
    evalError = undefined;
    const pattern = await repl.evaluate(code, false);
    parentPort.postMessage(
      pattern === undefined
        ? { id, error: evalError?.message ?? `No pattern from ${code}` }
        : { id, events: onsets(pattern, from, to) },
    );
  });
}

/** How long one check may run. A query that never ends would otherwise hang the run. */
const CHECK_TIMEOUT_MS = 30_000;

/**
 * Runs `fn` and fails it after CHECK_TIMEOUT_MS, stopping the worker, which may be stuck in a
 * query: the test process can then exit, and every later query fails at once. The runner's own
 * timeout fails the test but does not stop the worker, and a test's `signal` aborts when the test
 * ends in any way, so neither can decide when to stop it.
 */
async function withinTimeout(fn) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS} ms; the Strudel worker was stopped`));
    }, CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fn(), expired]);
  } finally {
    clearTimeout(timer);
  }
}

// On the main thread the tests run and a worker hosts Strudel; in the worker, `check` defines
// nothing, so the tests run once.
const check = isMainThread
  ? (name, fn) => test(name, { timeout: CHECK_TIMEOUT_MS }, () => withinTimeout(fn))
  : () => undefined;
const worker = isMainThread ? startWorker() : undefined;
let workerStopped = false;
let lastId = 0;

/** Starts the Strudel worker, with its console output captured and dropped. */
function startWorker() {
  const started = new Worker(new URL(import.meta.url), { stdout: true, stderr: true });
  started.stdout.resume();
  started.stderr.resume();
  started.once('exit', () => {
    workerStopped = true;
  });
  after(() => started.terminate());
  return started;
}

/** Sends `message` to the worker and resolves to its reply. Rejects once the worker has stopped. */
function ask(message) {
  const stopped = () => new Error('The Strudel worker has stopped');
  if (workerStopped) return Promise.reject(stopped());
  lastId += 1;
  const id = lastId;
  const reply = new Promise((resolve, reject) => {
    const onExit = () => reject(stopped());
    const onMessage = (answer) => {
      if (answer.id !== id) return;
      worker.off('message', onMessage).off('error', reject).off('exit', onExit);
      resolve(answer);
    };
    worker.on('message', onMessage).once('error', reject).once('exit', onExit);
  });
  worker.postMessage({ id, ...message });
  return reply;
}

/** The events `code` plays from cycle position `from` up to `to`. Throws the code's error. */
async function query(code, from = 0, to = 1) {
  const reply = await ask({ code, from, to });
  if (reply.error !== undefined) throw new Error(reply.error);
  return reply.events;
}

/** The MIDI note numbers of `notes`, as Strudel converts note names. */
const midi = async (notes) => (await ask({ notes })).midi;

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const SETS = [
  readJson('../../src/data/__fixtures__/cards.fixture.json'),
  ...readJson('../../src/data/__fixtures__/cards.extra.fixture.json').sets,
];
const solutions = readJson('./fixtures/demoSolutions.json');

/** The events in `cycle` (0 is the first cycle). */
const inCycle = (events, cycle) => events.filter(([start]) => start >= cycle && start < cycle + 1);

/** The `key` value of each event in `cycle`, in time order, joined by spaces. */
const played = (events, cycle, key = 'note') =>
  inCycle(events, cycle)
    .map(([, value]) => value[key])
    .join(' ');

/** Each event of `cycle` as `note@start`, sorted, for events that start together. */
const together = (events, cycle) =>
  inCycle(events, cycle)
    .filter(([, value]) => 'note' in value)
    .map(([start, value]) => `${value.note}@${start}`)
    .sort();

/** The card of `type` in the set at `index` (0 is set 1). */
function cardOf(index, type) {
  const card = SETS[index].cards.find((item) => item.type === type);
  assert.ok(card, `set ${index + 1} has no ${type} card`);
  return card;
}

/** Every code string in set `index`, with a label, including the stated solutions. */
function codeOfSet(index) {
  const n = index + 1;
  return [
    [`set ${n} concept`, cardOf(index, 'concept').snippet],
    ...cardOf(index, 'quiz').options.map((option, at) => [`set ${n} option ${at + 1}`, option]),
    [`set ${n} predict`, cardOf(index, 'predict').code],
    [`set ${n} exercise starter`, cardOf(index, 'exercise').starterCode],
    [`set ${n} review`, cardOf(index, 'review').snippet],
    [`set ${n} checkpoint starter`, cardOf(index, 'checkpoint').starterCode],
    [`set ${n} exercise solution`, solutions.exercise[index]],
    [`set ${n} checkpoint solution`, solutions.checkpoint[index]],
  ];
}

/** For each option of a choice card, what `read` finds in its first four cycles. */
async function readOptions(card, read) {
  const results = [];
  for (const option of card.options) results.push(read(await query(option, 0, 4)));
  return results;
}

check(
  'every snippet, option, starter and solution evaluates and plays in its first cycle',
  async () => {
    const code = SETS.flatMap((_, index) => codeOfSet(index));
    const failures = [];
    for (const [label, text] of code) {
      try {
        if ((await query(text)).length === 0) failures.push(`${label}: silent`);
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
      }
    }
    assert.equal(code.length, 4 * 11);
    assert.deepEqual(failures, []);
  },
);

check('an evaluation that throws is reported, so a broken snippet cannot pass', async () => {
  await assert.rejects(query('s("bd").notAFunction()'), /notAFunction/);
});

check('concept cards: each cycle tile shows what Strudel plays in that cycle', async () => {
  const tiles = [
    { read: (events, cycle) => played(events, cycle) },
    { read: (events, cycle) => `${inCycle(events, cycle).length} of 8` },
    { read: (events, cycle) => played(events, cycle) },
    // The copy starts 1/8 of a cycle later and 12 higher: c3 is followed by c4.
    {
      read: (events, cycle) =>
        inCycle(events, cycle).map(([start, value]) => [start - cycle, value.note]),
      expect: async (tile) => {
        const [note, copy] = tile.split(' ');
        return [[0, note], ...(await midi([copy])).map((number) => [1 / 8, number])];
      },
    },
  ];
  for (const [index, { read, expect = async (tile) => tile }] of tiles.entries()) {
    const card = cardOf(index, 'concept');
    const events = await query(card.snippet, 0, 3);
    const expected = [];
    for (const tile of card.cycles) expected.push(await expect(tile));
    assert.deepEqual(
      card.cycles.map((_, cycle) => read(events, cycle)),
      expected,
      `set ${index + 1}`,
    );
  }
  assert.deepEqual(await midi(['c3', 'c4']), [48, 60]);
});

check('quiz cards: only the correct option does what the question asks', async () => {
  // How many kicks play in cycles 1 and 2.
  const kicks = (events) => `${inCycle(events, 0).length} ${inCycle(events, 1).length}`;
  const set1 = cardOf(0, 'quiz');
  assert.deepEqual(await readOptions(set1, kicks), ['1 0', '4 4', '2 2', '1 1']);
  assert.equal(set1.correct, 1);

  const set2 = cardOf(1, 'quiz');
  assert.deepEqual(await readOptions(set2, kicks), ['3 3', '1 1', '5 5', '2 2']);
  assert.equal(set2.correct, 2);

  const set3 = cardOf(2, 'quiz');
  const reference = JSON.stringify(await query('s("bd sd").fast(2)', 0, 4));
  assert.ok(set3.title.includes('s("bd sd").fast(2)'));
  const same = await readOptions(set3, (events) => JSON.stringify(events) === reference);
  assert.deepEqual(same, [true, false, false, false]);
  assert.equal(set3.correct, 0);
  assert.equal(played(await query(set3.options[1], 0, 2), 0, 's'), 'bd');
  assert.equal(played(await query(set3.options[1], 0, 2), 1, 's'), 'sd');

  // What plays on the left (pan 0), on the right (pan 1) and with no pan, in the first cycle.
  const sides = (events) =>
    [0, 1, undefined].map((pan) =>
      inCycle(events, 0)
        .filter(([, value]) => value.pan === pan)
        .map(([, value]) => value.s)
        .join(' '),
    );
  const set4 = cardOf(3, 'quiz');
  const [rev, off, every, jux] = await readOptions(set4, sides);
  assert.deepEqual(jux, ['bd hh sd hh', 'hh sd hh bd', '']);
  assert.deepEqual(rev, ['', '', 'hh sd hh bd']);
  assert.ok([off, every].every(([left, right]) => left === '' && right === ''));
  assert.equal(set4.correct, 3);
});

check('predict cards: the correct option is what Strudel plays', async () => {
  const set1 = await query(cardOf(0, 'predict').code, 0, 2);
  assert.deepEqual([played(set1, 0), played(set1, 1)], ['c3 e3', 'c3 g3']);

  const set2 = await query(cardOf(1, 'predict').code, 0, 2);
  assert.deepEqual([...together(set2, 0), ...together(set2, 1)], ['c3@0', 'g3@0', 'e3@1', 'g3@1']);

  const set3 = await query(cardOf(2, 'predict').code, 0, 3);
  assert.deepEqual(
    [0, 1, 2].map((cycle) => played(set3, cycle)),
    ['g3 e3 c3', 'c3 e3 g3', 'g3 e3 c3'],
  );

  const set4 = await query(cardOf(3, 'predict').code, 0, 2);
  assert.deepEqual(
    set4.map(([, value]) => `${value.s} ${value.cutoff}`),
    ['bd 2000', 'sd 2000', 'bd 2000', 'sd 2000'],
  );

  const answers = [0, 1, 2, 3].map((index) => {
    const card = cardOf(index, 'predict');
    return card.options[card.correct];
  });
  assert.deepEqual(answers, [
    'c3 e3, then c3 g3',
    'c3 with g3, then e3 with g3',
    'g3 e3 c3, then c3 e3 g3',
    '2000, the last value',
  ]);
});

check('review snippets and exercise solutions play what their cards say', async () => {
  const alternation = await query(cardOf(1, 'review').snippet, 0, 3);
  assert.deepEqual([0, 1, 2].map((cycle) => played(alternation, cycle)).join(' '), 'c3 e3 g3');

  assert.deepEqual(together(await query(cardOf(2, 'review').snippet), 0), ['c3@0', 'e3@0', 'g3@0']);

  const steps = (await query(cardOf(3, 'review').snippet)).map(([start]) => start * 8);
  assert.deepEqual(steps, [0, 3, 6]);

  assert.deepEqual(together(await query(solutions.exercise[1]), 0), ['c3@0', 'e3@0', 'g3@0']);

  const reverb = await query(solutions.exercise[3]);
  const rooms = reverb.map(([, value]) => `${value.s}:${value.room ?? '-'}`);
  assert.deepEqual([...new Set(rooms)].sort(), ['bd:-', 'hh:-', 'sd:0.5']);
});

// This file runs twice: as the test file on the main thread, and as the Strudel worker.
if (!isMainThread) await hostStrudel();
