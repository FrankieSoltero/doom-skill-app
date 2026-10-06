// Character limits for card text, from the lines each card can spare on the reference phone (390
// by 844; a card's content box is 309 points wide and 543.5 tall), and line limits for card code.
// They guard the demo sets' content (`__tests__/demoBudget.test.ts`); they are not a layout test,
// since text wraps by word and glyph widths vary, so a string within its limit can still take one
// more line. The backend mirrors them (`services/api/app/models/card_limits.py`); the zod schema
// does not apply them, so the app never refuses a served card for its length.

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
  /**
   * A passage (a quoted sentence, a cloze's text, a scenario's situation, a numeric card's
   * problem): Barlow 15 across 280.3, 309 less the 1.5-point rule and 13.6 of padding a side.
   */
  passage: 44,
  /**
   * A cloze, scenario or numeric option in the two-column grid: Barlow 15 across 123.5, half of 309
   * less the 8-point gap, two 1.5-point borders and 12 of padding a side.
   */
  gridOption: 19,
  /**
   * A predict option in the two-column grid, in the code font: Menlo 14, 8.43 points a character,
   * across the grid cell's 123.5.
   */
  gridCode: 14,
};

/**
 * The characters a wrapped line can leave unused at its end: one average word, five letters and a
 * space. Greedy wrapping leaves half a word on average, so this counts twice that.
 */
const WRAP_LOSS = 6;

/** The characters `lines` lines hold at `perLine`, less the wrap loss of each line but the last. */
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
 * A passage: a source sentence quoted word for word (a quoted concept or review snippet, a cloze's
 * text), a scenario's situation or a numeric card's problem, 4 lines of the passage block.
 */
const PASSAGE = charsIn(4, CHARS_PER_LINE.passage);

/**
 * A cloze's, a scenario's and a numeric card's choices: the quiz's title and explanation, and four
 * options in a grid of two columns, each at most 2 lines of a grid cell.
 */
const PROSE_CHOICE_LIMITS = {
  ...CHOICE_LIMITS,
  options: 4,
  option: charsIn(2, CHARS_PER_LINE.gridOption),
};

/**
 * The review card's answer: Barlow 17, 7.09 points a character, across 309.
 */
const ANSWER_PER_LINE = 43;

/**
 * The review answer's lines. A revealed review card in a Strudel set, at its tallest (the rating
 * hint showing, the error notice under the code), is the kicker row (14), the prompt in 2 lines at
 * 38 (76), the answer at 26 a line, the 10-point gap, the code block (28 of padding and 22 a line),
 * the 13.6 gap and the notice (66), the rating row (106: caption, buttons, hint) and four 13.6 gaps
 * between the body's parts: 368, with 26 an answer line and 22 a code line. 4 answer lines and 3
 * code lines make 538; one more answer line makes 564, one more code line 560
 * (`cards/__tests__/ReviewCard.height.test.ts`).
 */
const ANSWER_LINES = 4;

/**
 * The most lines each code field may hold (M10 plan T, decision T1): its line breaks plus one
 * (`lineCount`). Code is never wrapped: a code block scrolls sideways, so its lines are its height.
 */
const CODE_LINES = {
  /**
   * A concept's snippet: the card at its limits (kicker row 14, title 76, body 138, Got it 50, five
   * 13.6 gaps) is 346; the code block's padding (28) and its one-line comment (19), the 13.6 gap
   * and the cycle tiles under the code (70, taller than any audio notice) add 130.6, and each code
   * line 22. 3 lines make 542.6; 4 make 564.6 (`cards/__tests__/ConceptCard.height.test.ts`).
   */
  concept: 3,
  /** A review card's snippet: 3, with `ANSWER_LINES` (above). */
  review: 3,
  /**
   * A predict card's code, answered in a Strudel set: the kicker row (14), the title (66), four
   * options in two rows of 2-line cells (134), the explanation (66), Next card (50), six 13.6 gaps,
   * the code block's padding (28) and the error notice under the code (79.6, with its gap) are
   * 519.2, and each code line 22. 1 line makes 541.2; 2 make 563.2
   * (`cards/__tests__/ChoiceCard.height.test.ts`).
   */
  predict: 1,
  /**
   * An exercise's starter code: the lines its editor shows whole. The editor is 100 points tall
   * with 12 of padding above and below, at 22 a line: 3 lines take 90, a fourth scrolls inside the
   * editor. The editor keeps its height, so the card does not grow with the starter
   * (`cards/__tests__/ExerciseCard.height.test.ts`).
   */
  exercise: 3,
};

/**
 * The most characters (or rows, or code lines) each card field may hold. Quiz options are four,
 * each at most 52 points tall, which holds 2 lines of code at 22 inside its 1.5-point borders.
 * Predict: the quiz's title and explanation, options of 2 lines of a grid cell in the code font
 * (the quiz's 48 characters take 4 lines there), and `CODE_LINES.predict`. Concept: title 2 lines,
 * body 6, a quoted snippet a passage. Review: the prompt in 2 lines of the concept title's style,
 * the answer in `ANSWER_LINES`. Cloze, scenario and numeric: a choice card with grid options whose
 * text, situation or problem is a passage. Checkpoint: 4 rubric rows of 1 line each. Exercise: 4
 * beat grid rows, in the starter code and in the solution.
 */
export const CARD_TEXT_LIMITS = {
  quiz: { ...CHOICE_LIMITS, options: 4, option: charsIn(2, CHARS_PER_LINE.option) },
  predict: {
    ...CHOICE_LIMITS,
    option: charsIn(2, CHARS_PER_LINE.gridCode),
    codeLines: CODE_LINES.predict,
  },
  concept: {
    title: charsIn(2, CHARS_PER_LINE.titleL),
    body: charsIn(6, CHARS_PER_LINE.body),
    quote: PASSAGE,
    snippetLines: CODE_LINES.concept,
  },
  review: {
    prompt: charsIn(2, CHARS_PER_LINE.titleL),
    answer: charsIn(ANSWER_LINES, ANSWER_PER_LINE),
    snippetLines: CODE_LINES.review,
  },
  cloze: { ...PROSE_CHOICE_LIMITS, text: PASSAGE },
  scenario: { ...PROSE_CHOICE_LIMITS, situation: PASSAGE },
  numeric: { ...PROSE_CHOICE_LIMITS, problem: PASSAGE },
  checkpoint: { rubricRows: 4, rubricLabel: charsIn(1, CHARS_PER_LINE.rubric) },
  exercise: { gridRows: 4, starterLines: CODE_LINES.exercise },
} as const;

/** The line-limit key of each card type's code field, in `CARD_TEXT_LIMITS`. */
export const CODE_LINE_FIELDS = {
  concept: 'snippetLines',
  review: 'snippetLines',
  predict: 'codeLines',
  exercise: 'starterLines',
} as const;

/**
 * The lines of `code` as the code budgets count them: its line breaks plus one, so a trailing
 * break counts the empty line after it; none for empty code.
 */
export function lineCount(code: string): number {
  return code === '' ? 0 : code.split('\n').length;
}
