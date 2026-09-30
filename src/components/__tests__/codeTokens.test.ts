import { cardSource, type Card } from '../../data';
import { tokenizeCode, type CodeToken } from '../codeTokens';

const fn = (text: string): CodeToken => ({ text, kind: 'fn' });
const plain = (text: string): CodeToken => ({ text, kind: 'plain' });
const comment = (text: string): CodeToken => ({ text, kind: 'comment' });

/** Joins the tokens' text: the round trip every input must survive. */
function joined(tokens: readonly CodeToken[]): string {
  return tokens.map((token) => token.text).join('');
}

/** Adjacent plain tokens would mean the list is not minimal. */
function hasAdjacentPlain(tokens: readonly CodeToken[]): boolean {
  return tokens.some(
    (token, index) => token.kind === 'plain' && tokens[index + 1]?.kind === 'plain',
  );
}

// Card fields that hold code or a code comment, per src/data/schema.ts.
const CODE_FIELDS: ReadonlySet<string> = new Set([
  'snippet',
  'snippetComment',
  'code',
  'starterCode',
]);

/** Every code string a card carries: its code fields, and a quiz's options, which are code. */
function codeOf(card: Card): string[] {
  const entries: [string, unknown][] = Object.entries(card);
  const fields = entries
    .filter(([key]) => CODE_FIELDS.has(key))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string');
  return card.type === 'quiz' ? [...fields, ...card.options] : fields;
}

// The bundled set, read once through the data boundary (rule SS-6).
let fixtureCards: Card[] = [];

beforeAll(async () => {
  const set = await cardSource.getNextSet();
  if (!set) throw new Error('The bundled source served no set');
  fixtureCards = set.cards;
});

describe('tokenizeCode: function names', () => {
  it.each<[string, string, CodeToken[]]>([
    ['a call to note', 'note("<c3 e3 g3>")', [fn('note'), plain('("<c3 e3 g3>")')]],
    ['a call to s', 's("bd*4")', [fn('s'), plain('("bd*4")')]],
    ['a call to stack', 'stack(', [fn('stack'), plain('(')]],
    ['a call to sound', 'sound("piano")', [fn('sound'), plain('("piano")')]],
    ['a method call after a dot', '.s("bd")', [plain('.'), fn('s'), plain('("bd")')]],
    [
      'calls nested in a call',
      'stack(s("bd"), note("c3"))',
      [fn('stack'), plain('('), fn('s'), plain('("bd"), '), fn('note'), plain('("c3"))')],
    ],
    ['a call after a line break', 'x\ns("hh")', [plain('x\n'), fn('s'), plain('("hh")')]],
  ])('marks %s as fn', (_case, code, expected) => {
    expect(tokenizeCode(code)).toStrictEqual(expected);
  });

  it.each<[string, string]>([
    ['a longer name ending in a known one', 'bass("x")'],
    ['a longer name starting with a known one', 'notes("x")'],
    ['a known name inside a longer word', 'sounds(s1)'],
    ['a name with a digit suffix', 's2("x")'],
    ['a name with an underscore', '_s("x")'],
    ['a name with a dollar sign', '$note("x")'],
    ['a known name not followed by (', 's "bd"'],
    ['a known name with a space before (', 'note ("c3")'],
    ['a known name at the end of the input', 'stack'],
    ['an unknown call', 'setcps(1)'],
  ])('leaves %s plain', (_case, code) => {
    expect(tokenizeCode(code)).toStrictEqual([plain(code)]);
  });
});

describe('tokenizeCode: comments', () => {
  it.each<[string, string, CodeToken[]]>([
    ['a whole-line comment', '// cycle 1', [comment('// cycle 1')]],
    ['a trailing comment', 's("bd") // kick', [fn('s'), plain('("bd") '), comment('// kick')]],
    ['a comment ended by \\n', '// a\ns(', [comment('// a'), plain('\n'), fn('s'), plain('(')]],
    ['a comment ended by \\r\\n', '// a\r\nx', [comment('// a'), plain('\r\nx')]],
    ['a comment ended by a lone \\r', '// a\rx', [comment('// a'), plain('\rx')]],
    ['a known call inside a comment', '// s("bd")', [comment('// s("bd")')]],
    ['an empty comment', '//', [comment('//')]],
    ['three slashes', '///x', [comment('///x')]],
    ['two comment lines', '// a\n// b', [comment('// a'), plain('\n'), comment('// b')]],
  ])('reads %s', (_case, code, expected) => {
    expect(tokenizeCode(code)).toStrictEqual(expected);
  });

  it.each<[string, string]>([
    ['a single slash', '("bd/4")'],
    ['slashes split by a space', '/ /'],
  ])('leaves %s plain', (_case, code) => {
    expect(tokenizeCode(code)).toStrictEqual([plain(code)]);
  });
});

describe('tokenizeCode: strings', () => {
  it.each<[string, string, CodeToken[]]>([
    ['// in a double-quoted string', 's("bd // sd")', [fn('s'), plain('("bd // sd")')]],
    ['// in a single-quoted string', "s('bd // sd')", [fn('s'), plain("('bd // sd')")]],
    ['// in a backtick string', 's(`bd // sd`)', [fn('s'), plain('(`bd // sd`)')]],
    ['a URL in a string', 'x("https://a.b")', [plain('x("https://a.b")')]],
    [
      'a comment after a string that holds //',
      's("a//b") // kick',
      [fn('s'), plain('("a//b") '), comment('// kick')],
    ],
    ['an escaped quote', 's("a\\"//b")', [fn('s'), plain('("a\\"//b")')]],
    [
      'an escaped backslash before the end',
      's("a\\\\")//c',
      [fn('s'), plain('("a\\\\")'), comment('//c')],
    ],
    ['a call inside a string', '"s(x)"', [plain('"s(x)"')]],
    ['the other quotes inside a string', '"it\'s `x` // y"', [plain('"it\'s `x` // y"')]],
    ['a quoted string ended by the line break', '"a\n// b', [plain('"a\n'), comment('// b')]],
    ['a backtick string over two lines', '`a\n// b`', [plain('`a\n// b`')]],
    ['an unclosed backtick string', '`a // b', [plain('`a // b')]],
  ])('reads %s', (_case, code, expected) => {
    expect(tokenizeCode(code)).toStrictEqual(expected);
  });

  it('reads 5,000 quotes in linear time as plain text', () => {
    const code = '"'.repeat(5000);

    expect(tokenizeCode(code)).toStrictEqual([plain(code)]);
  });
});

describe('tokenizeCode: round trip and minimal tokens', () => {
  it('returns no tokens for the empty string', () => {
    expect(tokenizeCode('')).toStrictEqual([]);
  });

  it.each<[string, string]>([
    ['\\n line breaks', 'stack(\n  s("bd ~ sd ~"),\n  s("hh*4")\n)'],
    ['\\r\\n line breaks', 'stack(\r\n  s("bd"),\r\n  note("c3")\r\n)\r\n'],
    ['tabs', '\ts("bd")\t// kick\t'],
    ['emoji', 'note("🎹 c3") // 🥁 → 🎶'],
    ['an emoji next to a call', '🎹s("x")'],
    ['unbalanced quotes', 's("bd ~ sd\nnote(\'c3'],
    ['only whitespace', ' \n\t\r\n '],
    ['a lone surrogate', 's(\ud83c'],
    ['5,000 characters of s( repeated', 's('.repeat(2500)],
    ['5,000 slashes', '/'.repeat(5000)],
    ['6,000 characters of note ( with a space', 'note ('.repeat(1000)],
    ['5,000 letters with no call', 'a'.repeat(5000)],
  ])('gives back input with %s, with no empty or adjacent plain tokens', (_case, code) => {
    const tokens = tokenizeCode(code);

    expect(joined(tokens)).toBe(code);
    expect(tokens.every((token) => token.text.length > 0)).toBe(true);
    expect(hasAdjacentPlain(tokens)).toBe(false);
  });

  it('tokenizes 5,000 characters of s( as 2,500 calls', () => {
    const tokens = tokenizeCode('s('.repeat(2500));

    expect(tokens).toHaveLength(5000);
    expect(tokens.filter((token) => token.kind === 'fn')).toHaveLength(2500);
  });

  it('tokenizes 5,000 slashes as one comment', () => {
    expect(tokenizeCode('/'.repeat(5000))).toStrictEqual([comment('/'.repeat(5000))]);
  });
});

describe('tokenizeCode: the bundled demo content', () => {
  it('round-trips every code string in the fixture', () => {
    const snippets = fixtureCards.flatMap(codeOf);

    // concept snippet + comment, 4 quiz options, predict code, exercise, review, checkpoint.
    expect(snippets).toHaveLength(10);
    for (const snippet of snippets) {
      const tokens = tokenizeCode(snippet);
      expect(joined(tokens)).toBe(snippet);
      expect(hasAdjacentPlain(tokens)).toBe(false);
    }
  });

  it('finds one comment in the fixture: the concept card snippetComment, whole', () => {
    const comments = fixtureCards
      .flatMap(codeOf)
      .flatMap(tokenizeCode)
      .filter((token) => token.kind === 'comment');

    expect(comments).toStrictEqual([comment('// cycle 1 → c3 · 2 → e3 · 3 → g3')]);
  });

  it('colors the exercise starter code: stack and both s calls', () => {
    const exercise = fixtureCards.find((card) => card.type === 'exercise');

    expect(tokenizeCode(exercise?.starterCode ?? '')).toStrictEqual([
      fn('stack'),
      plain('(\n  '),
      fn('s'),
      plain('("bd ~ sd ~"),\n  '),
      fn('s'),
      plain('("hh*4")\n)'),
    ]);
  });
});
