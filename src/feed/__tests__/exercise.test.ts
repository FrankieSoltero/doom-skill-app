import type { ExerciseCard } from '../../data';
import { checkExercise, type GridRow, parseGrid } from '../exercise';

type Check = ExerciseCard['checks'][number];

/** A 16-step row with hits at exactly the given positions. */
function row(name: string, positions: number[]): GridRow {
  return { name, hits: Array.from({ length: 16 }, (_, i) => positions.includes(i)) };
}

function contains(value: string, ignoreWhitespace: boolean): Check {
  return { kind: 'contains', value, ignoreWhitespace };
}

describe('parseGrid', () => {
  it('parses the starter code into one row per sample, in order of first appearance', () => {
    const code = 'stack(\n  s("bd ~ sd ~"),\n  s("hh*4")\n)';

    expect(parseGrid(code)).toEqual([row('bd', [0]), row('sd', [8]), row('hh', [0, 4, 8, 12])]);
  });

  it('spreads a multiplier across its step', () => {
    expect(parseGrid('s("hh*8")')).toEqual([row('hh', [0, 2, 4, 6, 8, 10, 12, 14])]);
  });

  it('makes no row for a rest', () => {
    expect(parseGrid('s("bd ~ ~ ~")')).toEqual([row('bd', [0])]);
  });

  it('uses only the first bracket group when the pattern has one', () => {
    expect(parseGrid('s("<[bd ~ sd ~] [bd bd sd ~]>")')).toEqual([row('bd', [0]), row('sd', [8])]);
  });

  it('treats angle brackets as spaces', () => {
    expect(parseGrid('s("<bd sd>")')).toEqual([row('bd', [0]), row('sd', [8])]);
  });

  it.each([['note("c3")'], [''], ['s("")'], ['s("~ ~")']])('returns no rows for %j', (code) => {
    expect(parseGrid(code)).toEqual([]);
  });

  it('keeps the first four names only', () => {
    const rows = parseGrid('s("bd sd hh cp oh")');

    expect(rows.map((r) => r.name)).toEqual(['bd', 'sd', 'hh', 'cp']);
  });

  it('merges a repeated name into one row holding the union of hits', () => {
    expect(parseGrid('stack(s("hh*4"), s("hh ~"))')).toEqual([row('hh', [0, 4, 8, 12])]);
    expect(parseGrid('stack(s("~ hh"), s("hh ~"))')).toEqual([row('hh', [0, 8])]);
  });

  it.each([['hh*x'], ['hh*']])('treats the multiplier in %s as 1', (token) => {
    expect(parseGrid(`s("${token} ~")`)).toEqual([row('hh', [0])]);
  });

  it('makes no hits, and so no row, for a zero multiplier', () => {
    expect(parseGrid('s("hh*0 bd")')).toEqual([row('bd', [8])]);
  });

  it('fills the slot when the multiplier puts hits under a step apart', () => {
    expect(parseGrid('s("bd*65 ~ ~")')).toEqual([row('bd', [0, 1, 2, 3, 4, 5])]);
    expect(parseGrid('s("~ bd*100 ~")')).toEqual([row('bd', [5, 6, 7, 8, 9, 10])]);
  });

  it('answers at once for a huge multiplier typed by the learner', () => {
    const all = Array.from({ length: 16 }, (_, i) => i);

    expect(parseGrid('s("hh*1000000000")')).toEqual([row('hh', all)]);
  });

  it('treats a multiplier too large to be an exact integer as 1', () => {
    expect(parseGrid(`s("hh*${'9'.repeat(400)} ~")`)).toEqual([row('hh', [0])]);
  });

  it('skips a token with no name', () => {
    expect(parseGrid('s("*2 bd")')).toEqual([row('bd', [8])]);
  });

  it('keeps every row exactly 16 steps long for an uneven step count', () => {
    const rows = parseGrid('s("bd sd hh")');

    expect(rows).toEqual([row('bd', [0]), row('sd', [5]), row('hh', [10])]);
    rows.forEach((r) => {
      expect(r.hits).toHaveLength(16);
    });
  });
});

describe('checkExercise', () => {
  const hh8 = contains('hh*8', true);

  it('passes when the code contains the value, whitespace ignored', () => {
    expect(checkExercise('s("hh*8")', [hh8])).toBe(true);
    expect(checkExercise('s("hh * 8")', [hh8])).toBe(true);
    expect(checkExercise('s("h h\n*\t8")', [hh8])).toBe(true);
  });

  it('ignores whitespace in the value too', () => {
    expect(checkExercise('s("hh*8")', [contains('hh * 8', true)])).toBe(true);
  });

  it('fails when the code does not contain the value', () => {
    expect(checkExercise('s("hh*4")', [hh8])).toBe(false);
  });

  it('respects whitespace when ignoreWhitespace is false', () => {
    const strict = contains('hh*8', false);

    expect(checkExercise('s("hh * 8")', [strict])).toBe(false);
    expect(checkExercise('s("hh*8")', [strict])).toBe(true);
  });

  it('passes only when every check passes', () => {
    const bd = contains('bd', false);

    expect(checkExercise('stack(s("bd"), s("hh*8"))', [hh8, bd])).toBe(true);
    expect(checkExercise('s("hh*8")', [hh8, bd])).toBe(false);
    expect(checkExercise('s("bd")', [hh8, bd])).toBe(false);
  });

  it('fails when there is nothing to check', () => {
    expect(checkExercise('s("hh*8")', [])).toBe(false);
  });

  it('ignores case for sql only, as the server does (card_checks.passes)', () => {
    const partition = contains('PARTITION BY dept', true);
    const code = 'select rank() over (partition by dept) from t';

    expect(checkExercise(code, [partition], 'sql')).toBe(true);
    expect(checkExercise(code, [partition], 'strudel')).toBe(false);
    expect(checkExercise(code, [partition])).toBe(false);
    expect(checkExercise(code, [partition], 'python')).toBe(false);
  });
});
