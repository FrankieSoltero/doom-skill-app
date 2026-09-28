// Character limits for card text, from the lines each card can spare on the reference phone (390
// by 844; a card's content box is 309 points wide and 543.5 tall). They guard the demo sets'
// content (`__tests__/demoBudget.test.ts`); they are not a layout test, since text wraps by word
// and glyph widths vary, so a string within its limit can still take one more line. The backend
// can reuse them as schema limits later; the zod schema does not apply them yet.

/**
 * The average characters one line holds, per text style: the line's width divided by the style's
 * average advance per character, rounded down. The averages were measured from the bundled font
 * files (the `hmtx` advance widths of BarlowCondensed_600SemiBold, and of Barlow_400Regular with
 * Barlow_700Bold for bold spans) over all the demo text in that font at commit 034cd38, spaces
 * included: 0.357 em a character for titles, 0.417 em for body text. Menlo, the code font, is
 * monospaced at 0.602 em.
 */
const CHARS_PER_LINE = {
  /** Quiz and predict title: Barlow Condensed 32, 11.43 points a character, across 309. */
  titleM: 27,
  /** Concept title: Barlow Condensed 38, 13.57 points a character, across 309. */
  titleL: 22,
  /** Concept body: Barlow 15, 6.25 points a character, across 309. */
  body: 49,
  /** Quiz and predict explanation: Barlow 14, 5.84 points a character, across 309. */
  explanation: 52,
  /**
   * Checkpoint rubric label: Barlow 13.5, 5.63 points a character, across 281 (309 less the
   * 18-point box and the 10-point gap before the label).
   */
  rubric: 49,
  /**
   * Quiz option: Menlo 15, 9.03 points a character, across 250 (309 less two 1.5-point borders,
   * 14 points of padding a side, the 10-point gap and the 18-point verdict icon).
   */
  option: 27,
};

/**
 * The characters a wrapped line can leave unused at its end: one average word, five letters and a
 * space. Greedy wrapping leaves half a word on average, so this counts twice that.
 */
const WRAP_LOSS = 6;

/** The characters `lines` lines hold at `perLine`, less the wrap loss of every line but the last. */
function charsIn(lines: number, perLine: number): number {
  return lines * perLine - (lines - 1) * WRAP_LOSS;
}

/**
 * The characters of the verdict drawn before an explanation: `Not quite.`, the longer of
 * `copy.correct` and `copy.notQuite`, and a space.
 */
export const VERDICT_CHARS = 11;

/**
 * Quiz and predict title: 2 lines at 33 points. Explanation: 3 lines at 22, the verdict included.
 * These are the lines left once a quiz is answered with four options.
 */
const CHOICE_LIMITS = {
  title: charsIn(2, CHARS_PER_LINE.titleM),
  explanation: charsIn(3, CHARS_PER_LINE.explanation) - VERDICT_CHARS,
};

/**
 * The most characters (or rows) each card field may hold. Quiz options are four, each at most 52
 * points tall, which holds 2 lines of code at 22 inside its 1.5-point borders. Concept: title 2
 * lines, body 6. Checkpoint: 4 rubric rows of 1 line each. Exercise: 4 beat grid rows, in the
 * starter code and in the solution.
 */
export const CARD_TEXT_LIMITS = {
  quiz: { ...CHOICE_LIMITS, options: 4, option: charsIn(2, CHARS_PER_LINE.option) },
  predict: CHOICE_LIMITS,
  concept: { title: charsIn(2, CHARS_PER_LINE.titleL), body: charsIn(6, CHARS_PER_LINE.body) },
  checkpoint: { rubricRows: 4, rubricLabel: charsIn(1, CHARS_PER_LINE.rubric) },
  exercise: { gridRows: 4 },
} as const;
