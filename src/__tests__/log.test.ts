import { logError, logWarning } from '../log';

// Calls a logger the way an untyped caller could: with data from outside that defeats the
// parameter types. The logger must still clean it at run time.
function callUntyped(logger: typeof logWarning | typeof logError, ...args: unknown[]): void {
  Reflect.apply(logger, undefined, args);
}

const LONG_TEXT = 'a'.repeat(250);
// Card text shaped to pass the name patterns: lowercase, underscores for spaces, over 40 long.
const SENTENCE_EVENT = 'the_user_typed_this_sentence_into_the_card';
const SENTENCE_KEY = 'The user typed their email me@example.com into the card';
const CUT_TEXT = 'a'.repeat(200);

let warn: jest.SpiedFunction<typeof console.warn>;
let error: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('logWarning', () => {
  it('makes one console.warn call with the event name and the context', () => {
    logWarning('fonts_failed', { faces: 4 });

    expect(warn.mock.calls).toStrictEqual([['fonts_failed', { faces: 4 }]]);
    expect(error).not.toHaveBeenCalled();
  });

  it('passes an empty object when there is no context', () => {
    logWarning('app_started');

    expect(warn.mock.calls).toStrictEqual([['app_started', {}]]);
  });

  it('keeps strings, numbers and booleans, including non-finite numbers', () => {
    const context = { screen: 'feed', count: 2, ok: false, ratio: NaN, limit: Infinity };

    logWarning('feed_shown', context);

    expect(warn.mock.calls).toStrictEqual([['feed_shown', context]]);
  });

  it('cuts a context string over 200 characters to 200', () => {
    logWarning('long_value', { detail: LONG_TEXT, exact: CUT_TEXT });

    expect(warn.mock.calls).toStrictEqual([['long_value', { detail: CUT_TEXT, exact: CUT_TEXT }]]);
  });

  it('drops context values that are not strings, numbers or booleans', () => {
    const outside = {
      card: { text: 'card content' },
      lines: ['user code'],
      none: null,
      missing: undefined,
      big: BigInt(1),
      tag: Symbol('tag'),
      run: () => 'code',
      kept: 'yes',
    };

    callUntyped(logWarning, 'outside_data', outside);

    expect(warn.mock.calls).toStrictEqual([['outside_data', { kept: 'yes' }]]);
  });

  it.each([
    ['a string', 'user typed this'],
    ['an array', ['user typed this']],
    ['null', null],
    ['a number', 7],
  ])('logs an empty context when the context is %s', (_label, context) => {
    callUntyped(logWarning, 'bad_context', context);

    expect(warn.mock.calls).toStrictEqual([['bad_context', {}]]);
  });

  it('drops a __proto__ key and keeps the plain object prototype', () => {
    callUntyped(logWarning, 'odd_key', JSON.parse('{"__proto__": "x"}'));

    const logged: unknown = warn.mock.calls[0]?.[1];
    expect(logged).toStrictEqual({});
    expect(Object.getPrototypeOf(logged)).toBe(Object.prototype);
  });

  it('never throws when console.warn throws', () => {
    warn.mockImplementation(() => {
      throw new Error('console is broken');
    });

    expect(() => {
      logWarning('fonts_failed', { faces: 4 });
    }).not.toThrow();
  });

  it('never throws and still logs once when reading the context throws', () => {
    const hostile = {
      get secret(): string {
        throw new Error('getter');
      },
    };

    expect(() => {
      logWarning('hostile_context', hostile);
    }).not.toThrow();
    expect(warn.mock.calls).toStrictEqual([['hostile_context', {}]]);
  });
});

describe('event names', () => {
  it.each(['a', 'fonts_failed', 'step2_done', 'e'.repeat(40)])(
    'logs the valid event %p as given',
    (event) => {
      logWarning(event);

      expect(warn.mock.calls).toStrictEqual([[event, {}]]);
    },
  );

  it.each([
    '',
    'Fonts_failed',
    'fonts-failed',
    'fonts failed',
    '2fonts',
    '_x',
    'me@example.com',
    'e'.repeat(41),
    SENTENCE_EVENT,
  ])('logs the invalid event %p as invalid_event and not the given text', (event) => {
    logWarning(event, { n: 1 });
    logError(event, new Error('x'));

    expect(warn.mock.calls).toStrictEqual([['invalid_event', { n: 1 }]]);
    expect(error.mock.calls).toStrictEqual([['invalid_event', { name: 'Error', message: 'x' }]]);
  });

  it('logs a non-string event as invalid_event without turning it into a string', () => {
    const event = {
      toString(): string {
        throw new Error('toString');
      },
    };

    callUntyped(logWarning, event);

    expect(warn.mock.calls).toStrictEqual([['invalid_event', {}]]);
  });
});

// Valid context entries in order: [`${prefix}0`, 0], [`${prefix}1`, 1], ...
function numberedEntries(prefix: string, count: number): [string, number][] {
  return Array.from({ length: count }, (_unused, index) => [`${prefix}${String(index)}`, index]);
}

describe('context keys', () => {
  it.each(['a', 'faces', 'cardIndex', 'step_2', 'k'.repeat(40)])('keeps the key %p', (key) => {
    logWarning('keys', { [key]: 1 });

    expect(warn.mock.calls).toStrictEqual([['keys', { [key]: 1 }]]);
  });

  it.each(['', 'has space', 'has-dash', '2fast', 'Leading', '_under', 'k'.repeat(41)])(
    'drops the key %p with its value',
    (key) => {
      logWarning('keys', { [key]: 'dropped value', kept: 1 });

      expect(warn.mock.calls).toStrictEqual([['keys', { kept: 1 }]]);
    },
  );

  it.each([SENTENCE_KEY, SENTENCE_EVENT])(
    'drops the sentence key %p so its text appears nowhere in the call',
    (key) => {
      logWarning('keys', { [key]: true });

      expect(warn.mock.calls).toStrictEqual([['keys', {}]]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
    },
  );

  it('logs the first 10 valid entries of 11', () => {
    const entries = numberedEntries('k', 11);

    logWarning('many', Object.fromEntries(entries));

    expect(warn.mock.calls).toStrictEqual([['many', Object.fromEntries(entries.slice(0, 10))]]);
  });

  it('does not count invalid keys or dropped values toward the 10', () => {
    const valid = numberedEntries('v', 10);
    const invalid = [
      ['Bad', 1],
      ['has space', 2],
      ['card', { text: 'card content' }],
    ];

    callUntyped(logWarning, 'many', Object.fromEntries([...invalid, ...valid]));

    expect(warn.mock.calls).toStrictEqual([['many', Object.fromEntries(valid)]]);
  });
});

describe('logError with an Error', () => {
  it("makes one console.error call with the event name, the error's name and its message", () => {
    logError('feed_load_failed', new Error('x'));

    expect(error.mock.calls).toStrictEqual([['feed_load_failed', { name: 'Error', message: 'x' }]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the name of an Error subclass and never logs the stack', () => {
    logError('parse_failed', new TypeError('bad input'));

    expect(error.mock.calls).toStrictEqual([
      ['parse_failed', { name: 'TypeError', message: 'bad input' }],
    ]);
  });

  it('cuts an error message over 200 characters to 200', () => {
    logError('long_error', new Error(LONG_TEXT));

    expect(error.mock.calls).toStrictEqual([['long_error', { name: 'Error', message: CUT_TEXT }]]);
  });

  it('never throws and still logs once when reading the error throws', () => {
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'message', {
      get(): string {
        throw new Error('getter');
      },
    });

    expect(() => {
      logError('hostile_error', hostile);
    }).not.toThrow();
    expect(error.mock.calls).toStrictEqual([
      ['hostile_error', { name: 'UnreadableError', message: '' }],
    ]);
  });

  it('never throws when console.error throws', () => {
    error.mockImplementation(() => {
      throw new Error('console is broken');
    });

    expect(() => {
      logError('feed_load_failed', new Error('x'));
    }).not.toThrow();
  });
});

describe('logError with a value that is not an Error', () => {
  it.each([
    ['a string', 'text', 'text'],
    ['a long string', LONG_TEXT, CUT_TEXT],
    ['a number', 42, '42'],
    ['a boolean', true, 'true'],
    ['a bigint', BigInt(9), '9'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['a symbol', Symbol('secret'), 'symbol'],
    ['an object with content', { card: 'card content' }, 'object'],
    ['an array', ['user code'], 'object'],
    ['a function', () => 'user code', 'function'],
  ])('logs %s as NonError with a string message', (_label, value, message) => {
    logError('e', value);

    expect(error.mock.calls).toStrictEqual([['e', { name: 'NonError', message }]]);
  });

  it('logs an object whose toString throws without calling it', () => {
    const value = {
      toString(): string {
        throw new Error('toString');
      },
    };

    logError('e', value);

    expect(error.mock.calls).toStrictEqual([['e', { name: 'NonError', message: 'object' }]]);
  });
});
