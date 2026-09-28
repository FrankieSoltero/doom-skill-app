import { logError } from '../log';

// The optional context on logError. log.test.ts covers the context rules in full through
// logWarning; this file checks that logError applies the same cleaning and keeps the error
// details separate from the context.

const ERROR_DETAILS = { name: 'Error', message: 'x' };

let error: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('logError with a context', () => {
  it('makes the two-argument call when there is no context', () => {
    logError('render_failed', new Error('x'));

    expect(error.mock.calls).toStrictEqual([['render_failed', ERROR_DETAILS]]);
  });

  it('passes the context as a third argument, cleaned like a warning context', () => {
    const outside = {
      boundary: 'feed',
      detail: 'a'.repeat(250),
      Bad: 1,
      card: { text: 'card content' },
      ...Object.fromEntries(Array.from({ length: 10 }, (_unused, i) => [`k${String(i)}`, i])),
    };

    Reflect.apply(logError, undefined, ['render_failed', new Error('x'), outside]);

    expect(error.mock.calls).toStrictEqual([
      [
        'render_failed',
        ERROR_DETAILS,
        {
          boundary: 'feed',
          detail: 'a'.repeat(200),
          ...Object.fromEntries(Array.from({ length: 8 }, (_unused, i) => [`k${String(i)}`, i])),
        },
      ],
    ]);
  });

  it('keeps the error details when the context has keys named name and message', () => {
    logError('render_failed', new Error('x'), { name: 'card', message: 'other' });

    expect(error.mock.calls).toStrictEqual([
      ['render_failed', ERROR_DETAILS, { name: 'card', message: 'other' }],
    ]);
  });

  it.each([
    ['a string', 'user typed this'],
    ['an array', ['user typed this']],
    ['null', null],
    ['a number', 7],
  ])('passes an empty third argument when the context is %s', (_label, context) => {
    Reflect.apply(logError, undefined, ['render_failed', new Error('x'), context]);

    expect(error.mock.calls).toStrictEqual([['render_failed', ERROR_DETAILS, {}]]);
  });

  it('never throws and still logs once when reading the context throws', () => {
    const hostile = {
      get secret(): string {
        throw new Error('getter');
      },
    };

    expect(() => {
      logError('render_failed', new Error('x'), hostile);
    }).not.toThrow();
    expect(error.mock.calls).toStrictEqual([['render_failed', ERROR_DETAILS, {}]]);
  });

  it('never throws when console.error throws with a context', () => {
    error.mockImplementation(() => {
      throw new Error('console is broken');
    });

    expect(() => {
      logError('render_failed', new Error('x'), { boundary: 'feed' });
    }).not.toThrow();
  });
});
