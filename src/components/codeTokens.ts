// Splits a Strudel snippet into colored tokens for the code block
// (docs/design/card-feed/README.md:21). A pure scanner: one pass, linear in the input length,
// with no regex that can backtrack. Joining the tokens' text always gives the input back.

export type CodeToken = { text: string; kind: 'fn' | 'comment' | 'plain' };

/** Strudel functions shown as `fn` when called: a whole word followed directly by `(`. */
const FUNCTION_NAMES: readonly string[] = ['note', 's', 'stack', 'sound'];

/** Starts a comment that runs to the end of the line. */
const COMMENT_START = '//';

/** One character of an identifier. Tested one character at a time, so it cannot backtrack. */
const WORD_CHAR = /^[\w$]$/;

/** The end of a run the scanner read at one position, and what kind of text it is. */
type Span = { kind: CodeToken['kind']; end: number };

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

function isLineBreak(char: string | undefined): boolean {
  return char === '\n' || char === '\r';
}

/** The index just past the last character of the line that `start` is on. */
function lineEnd(code: string, start: number): number {
  let end = start;
  while (end < code.length && !isLineBreak(code[end])) {
    end += 1;
  }
  return end;
}

/** The index just past the identifier that starts at `start`. */
function wordEnd(code: string, start: number): number {
  let end = start;
  while (isWordChar(code[end])) {
    end += 1;
  }
  return end;
}

/**
 * Reads one run at `start`: a comment to the end of the line, a whole word (a known function
 * name directly followed by `(` is `fn`), or one plain character. The scanner only lands on a
 * word's first character, because it steps over whole words.
 */
function scanAt(code: string, start: number): Span {
  if (code.startsWith(COMMENT_START, start)) {
    return { kind: 'comment', end: lineEnd(code, start) };
  }
  if (!isWordChar(code[start])) {
    return { kind: 'plain', end: start + 1 };
  }
  const end = wordEnd(code, start);
  const isCall = code[end] === '(' && FUNCTION_NAMES.includes(code.slice(start, end));
  return { kind: isCall ? 'fn' : 'plain', end };
}

/** Appends a plain run, skipping an empty one so the token list has no empty tokens. */
function pushPlain(tokens: CodeToken[], text: string): void {
  if (text.length > 0) {
    tokens.push({ text, kind: 'plain' });
  }
}

/**
 * The tokens of `code`, in order. Adjacent plain text is merged into one token, so the list is
 * minimal, and the empty string gives an empty list.
 */
export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < code.length) {
    const span = scanAt(code, index);
    if (span.kind !== 'plain') {
      pushPlain(tokens, code.slice(plainStart, index));
      tokens.push({ text: code.slice(index, span.end), kind: span.kind });
      plainStart = span.end;
    }
    index = span.end;
  }
  pushPlain(tokens, code.slice(plainStart));
  return tokens;
}
