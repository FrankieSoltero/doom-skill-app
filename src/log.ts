/**
 * The app's one logging module (SS-10 in docs/standards.md). ESLint's `no-console` rejects
 * `console.*` everywhere else, so every warning and error goes through here.
 *
 * What reaches the console is limited on purpose, so text cannot reach the logs:
 * - Event names: lowercase letters, digits and underscores, starting with a letter, at most 40
 *   characters. Any other event is logged as `invalid_event`; the given text is never logged.
 * - Context keys: identifiers such as `faces` or `cardIndex` (a lowercase letter, then letters,
 *   digits and underscores), at most 40 characters. Any other key is dropped with its value.
 * - Context values: strings (cut to 200 characters), numbers and booleans. Any other value is
 *   dropped with its key. At most the first 10 valid entries are logged.
 * - Errors: the name and the message, cut to 200 characters. Never the stack.
 * - `logError` takes an optional context, cleaned by the same rules. It is logged as a separate
 *   object after the error's, so a context key such as `name` cannot overwrite the error's fields.
 *
 * Never log card text, code the user typed, or anything that identifies a person. The checks run
 * at run time too, because a caller can pass data from outside that defeats the parameter types.
 * The logger itself never throws.
 */

type LogValue = string | number | boolean;
type LogContext = Record<string, LogValue>;

interface LoggedError {
  name: string;
  message: string;
}

/** Longest string the logger writes, for context values and error messages alike. */
const MAX_LOG_TEXT_LENGTH = 200;

/** Longest event name or context key the logger writes. */
const MAX_NAME_LENGTH = 40;

/** Most context entries the logger writes; later valid entries are dropped. */
const MAX_CONTEXT_ENTRIES = 10;

/** Lowercase letters, digits and underscores, starting with a letter. */
const EVENT_NAME = /^[a-z][a-z0-9_]*$/;

/** An identifier: a lowercase letter, then letters, digits and underscores. */
const CONTEXT_KEY = /^[a-z][a-zA-Z0-9_]*$/;

/** Logged in place of an event name that is not valid. */
const INVALID_EVENT = 'invalid_event';

/** The `name` logged for a thrown value that is not an Error. */
const NON_ERROR_NAME = 'NonError';

/** The `name` logged when reading an Error's fields throws. */
const UNREADABLE_ERROR_NAME = 'UnreadableError';

function cut(text: string): string {
  return text.slice(0, MAX_LOG_TEXT_LENGTH);
}

/**
 * A string for any value, without calling its `toString`: objects and functions are described by
 * their type, not their content, and a symbol by the word `symbol`.
 */
function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

function isLogValue(value: unknown): value is LogValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Checks the length first, so a long string is never scanned by the pattern. */
function isName(text: unknown, pattern: RegExp): text is string {
  return typeof text === 'string' && text.length <= MAX_NAME_LENGTH && pattern.test(text);
}

function isLogEntry(entry: [string, unknown]): entry is [string, LogValue] {
  return isName(entry[0], CONTEXT_KEY) && isLogValue(entry[1]);
}

function eventName(event: unknown): string {
  return isName(event, EVENT_NAME) ? event : INVALID_EVENT;
}

/** The first 10 entries with a valid key and a string (cut), number or boolean value. */
function cleanContext(context: unknown): LogContext {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    return {};
  }
  try {
    const kept = Object.entries(context).filter(isLogEntry).slice(0, MAX_CONTEXT_ENTRIES);
    return Object.fromEntries(
      kept.map(([key, value]) => [key, typeof value === 'string' ? cut(value) : value]),
    );
  } catch {
    return {};
  }
}

/** The error's name and message, cut. Never the stack: it can carry file paths and values. */
function readError(error: unknown): LoggedError {
  try {
    if (error instanceof Error) {
      return { name: cut(describeValue(error.name)), message: cut(describeValue(error.message)) };
    }
    return { name: NON_ERROR_NAME, message: cut(describeValue(error)) };
  } catch {
    return { name: UNREADABLE_ERROR_NAME, message: '' };
  }
}

/** Logs a warning: one `console.warn(event, context)` call. */
export function logWarning(event: string, context?: LogContext): void {
  try {
    console.warn(eventName(event), cleanContext(context));
  } catch {
    // A broken console must not break the app.
  }
}

/**
 * Logs an error: one `console.error(event, { name, message })` call, or
 * `console.error(event, { name, message }, context)` when a context is given.
 */
export function logError(event: string, error: unknown, context?: LogContext): void {
  try {
    if (context === undefined) {
      console.error(eventName(event), readError(error));
    } else {
      console.error(eventName(event), readError(error), cleanContext(context));
    }
  } catch {
    // A broken console must not break the app.
  }
}
