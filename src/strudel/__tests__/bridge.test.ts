// The bridge is the trust boundary between the app and the WebView page, which evaluates code the
// learner types. Everything the page sends is untrusted, so these cases are hostile on purpose.
import {
  decode,
  encode,
  MAX_CODE_LENGTH,
  MAX_RAW_LENGTH,
  pageScript,
  type ToPage,
} from '../bridge';

const json = (value: unknown): string => JSON.stringify(value);

// Written as code points: JavaScript source may hold these two characters raw, which hides them.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe('decode: valid messages', () => {
  it.each([
    { raw: json({ type: 'ready' }), expected: { type: 'ready' } },
    { raw: json({ type: 'needsNetwork' }), expected: { type: 'needsNetwork' } },
    { raw: json({ type: 'error', message: 'boom' }), expected: { type: 'error', message: 'boom' } },
    { raw: json({ type: 'error', message: '' }), expected: { type: 'error', message: '' } },
    { raw: json({ type: 'step', step: 0 }), expected: { type: 'step', step: 0 } },
    { raw: json({ type: 'step', step: 7 }), expected: { type: 'step', step: 7 } },
    { raw: json({ type: 'step', step: 15 }), expected: { type: 'step', step: 15 } },
    { raw: ' {"type":"ready"} ', expected: { type: 'ready' } },
  ])('reads $raw', ({ raw, expected }) => {
    expect(decode(raw)).toStrictEqual(expected);
  });

  it.each([
    { name: 'ready', raw: json({ type: 'ready', extra: 1 }), expected: { type: 'ready' } },
    {
      name: 'step',
      raw: json({ type: 'step', step: 3, at: 'now', nested: { a: [1, 2] } }),
      expected: { type: 'step', step: 3 },
    },
    {
      name: 'error',
      raw: json({ type: 'error', message: 'x', stack: 'secret', code: 's("bd")' }),
      expected: { type: 'error', message: 'x' },
    },
    {
      name: 'a 1,000-deep array beside needsNetwork',
      raw: `{"type":"needsNetwork","deep":${'['.repeat(1000)}${']'.repeat(1000)}}`,
      expected: { type: 'needsNetwork' },
    },
  ])('drops fields the message does not define: $name', ({ raw, expected }) => {
    const message = decode(raw);
    expect(message).toStrictEqual(expected);
    expect(Object.keys(message ?? {})).toStrictEqual(Object.keys(expected));
  });
});

describe('decode: invalid input gives null', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { type: 'ready' }],
    ['an array holding a valid message', [json({ type: 'ready' })]],
    ['a boolean', true],
  ])('rejects %s, which is not a string', (_name, raw) => {
    expect(decode(raw)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not JSON', 'not json'],
    ['cut-off JSON', '{"type":"ready"'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"ready"'],
    ['a JSON number', '42'],
    ['a JSON boolean', 'true'],
    ['an empty object', '{}'],
    ['a message the app sends, not the page', json({ type: 'play' })],
    ['a load message', json({ type: 'load', code: 's("bd")' })],
    ['an unknown type', json({ type: 'hello' })],
    ['a type in the wrong case', json({ type: 'READY' })],
    ['a type that is not a string', json({ type: ['ready'] })],
    ['a null type', json({ type: null })],
    ['a missing type', json({ step: 3 })],
    ['a step with no step', json({ type: 'step' })],
    ['an error with no message', json({ type: 'error' })],
    ['an error whose message is a number', json({ type: 'error', message: 42 })],
    ['an error whose message is null', json({ type: 'error', message: null })],
    ['an error whose message is an array', json({ type: 'error', message: ['x'] })],
    ['an error whose message is an object', json({ type: 'error', message: { a: 1 } })],
    ['a deeply nested array', `${'['.repeat(2000)}${']'.repeat(2000)}`],
    ['a deeply nested object', `${'{"a":'.repeat(800)}1${'}'.repeat(800)}`],
  ])('rejects %s', (_name, raw) => {
    expect(decode(raw)).toBeNull();
  });

  it.each([
    ['-1', '-1'],
    ['16', '16'],
    ['1.5', '1.5'],
    ['the string "7"', '"7"'],
    ['null', 'null'],
    ['infinity', '1e400'],
    ['a huge number', '1e20'],
    ['-0.5', '-0.5'],
  ])('rejects a step of %s', (_name, step) => {
    expect(decode(`{"type":"step","step":${step}}`)).toBeNull();
  });
});

describe('decode: length limits', () => {
  // The page cuts its error text to 500 characters, so a message over the raw cap is forged.
  const errorOf = (length: number): string => json({ type: 'error', message: 'e'.repeat(length) });

  it.each([499, 500, 501, 3000])(
    'keeps the first 500 characters of a %i-character message',
    (length) => {
      expect(decode(errorOf(length))).toStrictEqual({
        type: 'error',
        message: 'e'.repeat(Math.min(length, 500)),
      });
    },
  );

  it('keeps the first 500 characters, not the last, of a longer message', () => {
    const message = `${'a'.repeat(500)}${'b'.repeat(100)}`;
    expect(decode(json({ type: 'error', message }))).toStrictEqual({
      type: 'error',
      message: 'a'.repeat(500),
    });
  });

  it('accepts the longest error the page can send: 500 characters that all need escaping', () => {
    const raw = errorOf(0).replace('""', json('\u0001'.repeat(500)));
    expect(raw.length).toBeLessThanOrEqual(MAX_RAW_LENGTH);
    expect(decode(raw)).toStrictEqual({ type: 'error', message: '\u0001'.repeat(500) });
  });

  it('drops a 100,000-character message: its raw form is over the 4,096-character cap', () => {
    expect(decode(errorOf(100_000))).toBeNull();
  });

  it('accepts a raw message of exactly 4,096 characters and rejects 4,097', () => {
    const ready = json({ type: 'ready' });
    const padded = (length: number): string => ready + ' '.repeat(length - ready.length);
    expect(MAX_RAW_LENGTH).toBe(4096);
    expect(decode(padded(4096))).toStrictEqual({ type: 'ready' });
    expect(decode(padded(4097))).toBeNull();
  });

  it('rejects a 1 MB string without parsing it', () => {
    const parse = jest.spyOn(JSON, 'parse');
    expect(decode(`{"type":"ready","x":"${'x'.repeat(1024 * 1024)}"}`)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
});

describe('decode: hostile shapes', () => {
  afterEach(() => {
    // A failed case must not leave a polluted prototype for later tests.
    for (const key of ['polluted', 'hacked']) {
      Reflect.deleteProperty(Object.prototype, key);
    }
  });

  it.each([
    '{"type":"ready","__proto__":{}}',
    '{"type":"ready","__proto__":{"polluted":true}}',
    '{"type":"error","message":"x","__proto__":{"polluted":true}}',
    '{"type":"step","step":1,"constructor":{"prototype":{"polluted":true}}}',
    '{"__proto__":{"type":"ready","hacked":true}}',
  ])('leaves Object.prototype untouched for %s', (raw) => {
    const message = decode(raw);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.prototype).not.toHaveProperty('hacked');
    expect({}).not.toHaveProperty('polluted');
    if (message !== null) {
      expect(Object.getPrototypeOf(message)).toBe(Object.prototype);
      expect(Object.keys(message).sort()).not.toContain('__proto__');
      expect(Object.keys(message)).not.toContain('constructor');
    }
  });

  it('does not take the type from the prototype', () => {
    expect(decode('{"__proto__":{"type":"ready"}}')).toBeNull();
  });
});

/** A small deterministic generator (mulberry32), so every run tests the same strings. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  '{',
  '}',
  '[',
  ']',
  ':',
  ',',
  '"',
  '\\',
  ' ',
  '"type"',
  '"ready"',
  '"error"',
  '"step"',
  '"needsNetwork"',
  '"message"',
  '"__proto__"',
  'null',
  'true',
  '-',
  '0',
  '7',
  '15',
  '16',
  '1.5',
  'e9',
  LINE_SEPARATOR,
  '\ud800',
  '\u0000',
  'é',
  '😀',
  '{"type":"ready"}',
  '{"type":"step","step":3}',
];

function randomString(next: () => number): string {
  const count = Math.floor(next() * 40);
  let text = '';
  for (let index = 0; index < count; index += 1) {
    text += PIECES[Math.floor(next() * PIECES.length)] ?? '';
  }
  return text;
}

describe('decode: random input', () => {
  it('never throws on 10,000 random strings, and gives null or a known message', () => {
    const next = random(25);
    const types = new Set(['ready', 'error', 'step', 'needsNetwork']);
    let decoded = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const message = decode(randomString(next));
      if (message !== null) {
        decoded += 1;
        expect(types.has(message.type)).toBe(true);
      }
    }
    // Some strings are whole messages, so the type check above ran; most are not messages.
    expect(decoded).toBeGreaterThan(0);
    expect(decoded).toBeLessThan(10_000);
  });
});

describe('encode', () => {
  it.each<ToPage>([{ type: 'load', code: 's("bd sd")' }, { type: 'play' }, { type: 'stop' }])(
    'gives the JSON of $type',
    (message) => {
      expect(encode(message)).toBe(JSON.stringify(message));
      expect(JSON.parse(encode(message))).toStrictEqual(message);
    },
  );

  it('matches the page limit on code length', () => {
    expect(MAX_CODE_LENGTH).toBe(5000);
  });
});

describe('pageScript', () => {
  // Fixed text around one double-quoted literal: inside it, any character but a quote, a
  // backslash or a line break, or a backslash escape.
  const PAGE_SCRIPT =
    /^window\.dispatchEvent\(new MessageEvent\("message",\{data:("(?:[^"\\\n\r\u2028\u2029]|\\.)*")\}\)\);true;$/;

  const HOSTILE_CODE =
    'a"b\'c\\d\ne</script>`${x}`' + LINE_SEPARATOR + 'f' + PARAGRAPH_SEPARATOR + 'g';

  /**
   * The script is fixed text around one double-quoted string literal. The literal holds no
   * unescaped quote and no raw line break, so nothing in the code can end it early and run as
   * script. Returns the message the literal carries.
   */
  function carriedMessage(script: string): unknown {
    const literal = PAGE_SCRIPT.exec(script)?.[1];
    expect(literal).toBeDefined();
    const data: unknown = JSON.parse(literal ?? 'null');
    return typeof data === 'string' ? JSON.parse(data) : null;
  }

  it('dispatches a message event on window with the encoded message as its data', () => {
    expect(pageScript({ type: 'play' })).toBe(
      'window.dispatchEvent(new MessageEvent("message",{data:"{\\"type\\":\\"play\\"}"}));true;',
    );
  });

  it('embeds hostile code as one string literal that decodes back to the same code', () => {
    const script = pageScript({ type: 'load', code: HOSTILE_CODE });
    expect(script).toBe(
      'window.dispatchEvent(new MessageEvent("message",{data:' +
        '"{\\"type\\":\\"load\\",\\"code\\":\\"a\\\\\\"b\'c\\\\\\\\d\\\\ne</script>`${x}`\\u2028f\\u2029g\\"}"' +
        '}));true;',
    );
    expect(script).not.toMatch(/[\u2028\u2029\n]/);
    expect(carriedMessage(script)).toStrictEqual({ type: 'load', code: HOSTILE_CODE });
  });
});
