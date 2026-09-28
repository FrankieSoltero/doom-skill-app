/**
 * The app's one logging module (SS-10 in docs/standards.md). ESLint's `no-console` rejects
 * `console.*` everywhere else, so every warning and error goes through here.
 *
 * What reaches the console is limited on purpose: an event name that matches EVENT_NAME, and
 * short strings, numbers and booleans. Never log card text, code the user typed, or anything that
 * identifies a person. The checks below run at run time too, because a caller can pass data from
 * outside that defeats the parameter types. The logger itself never throws.
 */

type LogValue = string | number | boolean;
type LogContext = Record<string, LogValue>;

interface LoggedError {
  name: string;
  message: string;
}

/** Longest string the logger writes, for context values and error messages alike. */
const MAX_LOG_TEXT_LENGTH = 200;

/** Lowercase letters, digits and underscores, starting with a letter. */
const EVENT_NAME = /^[a-z][a-z0-9_]*$/;

/** Logged in place of an event name that does not match EVENT_NAME. */
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

function eventName(event: unknown): string {
  return typeof event === 'string' && EVENT_NAME.test(event) ? event : INVALID_EVENT;
}

/** Keeps strings (cut), numbers and booleans; drops everything else. */
function cleanContext(context: unknown): LogContext {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    return {};
  }
  try {
    const kept = Object.entries(context).filter((entry): entry is [string, LogValue] =>
      isLogValue(entry[1]),
    );
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

/** Logs an error: one `console.error(event, { name, message })` call. */
export function logError(event: string, error: unknown): void {
  try {
    console.error(eventName(event), readError(error));
  } catch {
    // A broken console must not break the app.
  }
}
