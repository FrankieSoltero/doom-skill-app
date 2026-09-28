import { boldSegments } from '../boldSegments';

type Segment = ReturnType<typeof boldSegments>[number];

const plain = (text: string): Segment => ({ text, bold: false });
const bold = (text: string): Segment => ({ text, bold: true });

/** The text a reader sees: every segment's text joined in order. */
function joined(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

// Each row: the input, its segments, and the input with its paired markers removed.
const CASES: [string, string, Segment[], string][] = [
  ['no markers', 'Plain text.', [plain('Plain text.')], 'Plain text.'],
  ['an empty input', '', [], ''],
  [
    'one pair',
    'Wrap steps in **< >** and play.',
    [plain('Wrap steps in '), bold('< >'), plain(' and play.')],
    'Wrap steps in < > and play.',
  ],
  [
    'two pairs',
    'A **rest** keeps a **step** silent.',
    [plain('A '), bold('rest'), plain(' keeps a '), bold('step'), plain(' silent.')],
    'A rest keeps a step silent.',
  ],
  [
    'a pair at the start and one at the end',
    '**Correct.** It is **bd*4**',
    [bold('Correct.'), plain(' It is '), bold('bd*4')],
    'Correct. It is bd*4',
  ],
  ['a whole bold input', '**all**', [bold('all')], 'all'],
  ['an unpaired marker', 'Use ** to mark', [plain('Use ** to mark')], 'Use ** to mark'],
  ['a pair then an unpaired marker', '**a** b ** c', [bold('a'), plain(' b ** c')], 'a b ** c'],
  ['adjacent pairs, merged into one bold run', '**a****b** c', [bold('ab'), plain(' c')], 'ab c'],
  ['an empty pair', 'x****y', [plain('xy')], 'xy'],
  ['only an empty pair', '****', [], ''],
  ['single stars', 'bd*4 and 2*3', [plain('bd*4 and 2*3')], 'bd*4 and 2*3'],
];

describe('boldSegments', () => {
  it.each(CASES)('splits %s', (_case, input, expected) => {
    expect(boldSegments(input)).toStrictEqual(expected);
  });

  it.each(CASES)(
    'round-trips %s: the joined text is the input without its paired markers',
    (_case, input, _segments, shown) => {
      expect(joined(boldSegments(input))).toBe(shown);
    },
  );

  it.each(CASES)(
    'returns no empty segment and no two neighbors of one weight for %s',
    (_case, input) => {
      const segments = boldSegments(input);

      expect(segments.every((segment) => segment.text.length > 0)).toBe(true);
      expect(segments.every((segment, index) => segments[index + 1]?.bold !== segment.bold)).toBe(
        true,
      );
    },
  );
});

describe('boldSegments on 5,000-character inputs', () => {
  it('bolds one long run between two markers', () => {
    const inner = 'a'.repeat(4996);

    expect(boldSegments(`**${inner}**`)).toStrictEqual([bold(inner)]);
  });

  it('splits 833 short pairs', () => {
    const input = '**x** '.repeat(833);
    const segments = boldSegments(input);

    expect(input.length).toBeGreaterThanOrEqual(4998);
    expect(segments).toHaveLength(1666);
    expect(segments.slice(0, 2)).toStrictEqual([bold('x'), plain(' ')]);
    expect(joined(segments)).toBe('x '.repeat(833));
  });

  it('keeps one long run with a single unpaired marker as typed', () => {
    const input = `**${'b'.repeat(4998)}`;

    expect(boldSegments(input)).toStrictEqual([plain(input)]);
  });

  it('drops 1,250 empty pairs', () => {
    expect(boldSegments('*'.repeat(5000))).toStrictEqual([]);
  });
});
