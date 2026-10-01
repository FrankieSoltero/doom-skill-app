// Rules for the exercise card: the step grid drawn from the learner's Strudel code, and the check
// that decides whether the code passes. Pure functions, no rendering.
//
// Provenance: `parseGrid` follows the reference prototype's `parseGrid`
// (`docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html`).
import type { ExerciseCard } from '../data';

/** One sample's row in the step grid. `hits` always holds `STEPS` entries. */
export type GridRow = { name: string; hits: boolean[] };

const STEPS = 16;
const MAX_ROWS = 4;
// The plan's pattern, kept as written. `patternsIn` slices each whole match rather than reading
// the capture group, whose type under `noUncheckedIndexedAccess` would add an unreachable branch.
const SAMPLE_PATTERN = /s\("([^"]*)"\)/g;
const PATTERN_OPEN = 's("';
const PATTERN_CLOSE = '")';
const BRACKET_GROUP = /\[([^\]]*)\]/;
const REST = '~';
/**
 * Above this multiplier, consecutive hits of one token land at most 16/65 of a step apart, so they
 * hit every step from the first to the last. The code is typed by the learner, and a loop of
 * `hh*1000000000` iterations would freeze the app, so such tokens fill that range instead.
 */
const DENSE_MULTIPLIER = 64;

/** The mini-notation inside each `s("...")` in `code`, in order. */
function patternsIn(code: string): string[] {
  return (code.match(SAMPLE_PATTERN) ?? []).map((call) =>
    call.slice(PATTERN_OPEN.length, -PATTERN_CLOSE.length),
  );
}

/** The tokens of one mini-notation pattern: the first bracket group if any, else the whole. */
function tokensOf(pattern: string): string[] {
  const group = BRACKET_GROUP.exec(pattern)?.[1];
  const body = group ?? pattern.replace(/[<>]/g, ' ');
  return body.split(/\s+/).filter((token) => token !== '');
}

/** The multiplier after `*`, or 1 when it is missing or not an exactly representable integer. */
function multiplierOf(raw: string | undefined): number {
  const k = Number.parseInt(raw ?? '', 10);
  return Number.isSafeInteger(k) ? k : 1;
}

/** The whole numbers from `first` to `last`, both included. */
function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

/** The steps hit by the token at `index` of `count` tokens, played `k` times within its slot. */
function stepsOf(index: number, count: number, k: number): number[] {
  const stepAt = (j: number): number => Math.floor(((index + j / k) / count) * STEPS);
  const steps =
    k > DENSE_MULTIPLIER
      ? range(stepAt(0), stepAt(k - 1))
      : Array.from({ length: Math.max(k, 0) }, (_, j) => stepAt(j));
  return steps.filter((step) => step < STEPS);
}

/** Marks `steps` in the row for `name`, creating the row on its first hit. */
function markHits(rows: Map<string, boolean[]>, name: string, steps: number[]): void {
  if (steps.length === 0) return;
  const hits = rows.get(name) ?? new Array<boolean>(STEPS).fill(false);
  steps.forEach((step) => (hits[step] = true));
  rows.set(name, hits);
}

/**
 * The step grid for `code`: one row per sample named in an `s("...")` pattern, in order of first
 * appearance, at most four. A name used in several patterns gets one row with the union of hits.
 */
export function parseGrid(code: string): GridRow[] {
  const rows = new Map<string, boolean[]>();
  for (const pattern of patternsIn(code)) {
    const tokens = tokensOf(pattern);
    tokens.forEach((token, index) => {
      const [name, multiplier] = token.split('*');
      if (!name || name === REST) return;
      markHits(rows, name, stepsOf(index, tokens.length, multiplierOf(multiplier)));
    });
  }
  return [...rows].slice(0, MAX_ROWS).map(([name, hits]) => ({ name, hits }));
}

const stripWhitespace = (text: string): string => text.replace(/\s+/g, '');

/** The languages whose checks ignore case, as the server's (`card_checks.CASE_INSENSITIVE`). */
const CASE_INSENSITIVE: ReadonlySet<string> = new Set(['sql']);

/**
 * True when `code` passes every check, the server's rule (`card_checks.passes`). An exercise with
 * no checks cannot pass. For `sql`, which is case-insensitive, both sides are lower-cased first.
 */
export function checkExercise(
  code: string,
  checks: ExerciseCard['checks'],
  lang: ExerciseCard['lang'] = 'strudel',
): boolean {
  if (checks.length === 0) return false;
  const fold = (text: string) => (CASE_INSENSITIVE.has(lang) ? text.toLowerCase() : text);
  const written = fold(code);
  return checks.every(({ value, ignoreWhitespace }) =>
    ignoreWhitespace
      ? stripWhitespace(written).includes(stripWhitespace(fold(value)))
      : written.includes(fold(value)),
  );
}
