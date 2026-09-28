// The message bridge between the app and the Strudel page in the hidden WebView
// (src/strudel/page/player.js). The page evaluates code the learner types, so it is untrusted:
// everything it sends goes through `decode`, the one trust boundary, before the app reads it.
//
// Contract (as built in player.js). Each message is a JSON string.
//   App to page: {type:'load', code}, {type:'play'}, {type:'stop'}
//   Page to app: {type:'ready'}, {type:'error', message}, {type:'step', step}, {type:'needsNetwork'}
import { z } from 'zod';

/** A message the app sends to the page. */
export type ToPage = { type: 'load'; code: string } | { type: 'play' } | { type: 'stop' };

/** The longest code the app sends. The page has the same limit (MAX_CODE_LENGTH in player.js). */
export const MAX_CODE_LENGTH = 5000;

/**
 * The longest raw string `decode` reads. The page cuts its error text to 500 characters, and even
 * 500 characters that all need a six-character JSON escape stay near 3,000, so anything longer is
 * not from the page as built. The cap also bounds the work `JSON.parse` does on hostile input.
 */
export const MAX_RAW_LENGTH = 4096;

/** The longest error text the app keeps from the page. */
const MAX_ERROR_LENGTH = 500;

/** The page's beat grid has 16 steps, 0 to 15. */
const LAST_STEP = 15;

// zod's default object mode strips keys a schema does not name: the parsed result is a new object
// holding only the known fields, so nothing else the page sends (a `__proto__` key included)
// reaches the app. Strip rather than strict, so a harmless extra field from a later page version
// does not turn a valid message into a dropped one.
const fromPageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('error'),
    message: z.string().transform((message) => message.slice(0, MAX_ERROR_LENGTH)),
  }),
  z.object({ type: z.literal('step'), step: z.number().int().min(0).max(LAST_STEP) }),
  z.object({ type: z.literal('needsNetwork') }),
]);

/**
 * A message from the page, after `decode`. An `error` message's text is the page's, cut to 500
 * characters: untrusted text, to be shown as plain text only, never as markup or code.
 */
export type FromPage = z.infer<typeof fromPageSchema>;

/** The JSON string of a message to the page. */
export function encode(message: ToPage): string {
  return JSON.stringify(message);
}

/**
 * Reads one raw message from the page. Anything that is not a string of at most 4,096 characters
 * holding exactly one known message gives null. Never throws.
 */
export function decode(raw: unknown): FromPage | null {
  if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) {
    return null;
  }
  try {
    const parsed = fromPageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** U+2028 and U+2029, which JSON.stringify leaves raw, written as escapes. */
const LINE_BREAKS = /[\u2028\u2029]/g;

function escapeLineBreak(character: string): string {
  return `\\u${character.charCodeAt(0).toString(16)}`;
}

/**
 * The script that hands one message to the page: it dispatches a `message` event on `window`,
 * which is where player.js listens, with the encoded message as the event's `data`.
 *
 * The WebView's own `postMessage` is not used: on Android, react-native-webview 13.16.1 dispatches
 * that event on `document`, where the page's `window` listener never sees it.
 *
 * The encoded message is embedded as a JSON string literal (`JSON.stringify` of the encoded
 * string), never by pasting the learner's code into script text, so quotes, backslashes, line
 * breaks and `</script>` in the code stay data. The trailing `true` is what the library's docs
 * ask an injected script to end with.
 */
export function pageScript(message: ToPage): string {
  const data = JSON.stringify(encode(message)).replace(LINE_BREAKS, escapeLineBreak);
  return `window.dispatchEvent(new MessageEvent("message",{data:${data}}));true;`;
}
