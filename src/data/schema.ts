// The card data contract (rule SS-7): every card type in the app is inferred from these zod
// schemas. Objects are parsed with zod's default strip mode, so keys a schema does not name
// (such as the fixture's `tree`) are dropped rather than rejected.
import { z } from 'zod';

import { logWarning } from '../log';
import { keypadSchema } from './keypadSchema';

const text = z.string().min(1);
const count = z.number().int().nonnegative();
const seconds = z.number().int().positive();
const fraction = z.number().min(0).max(1);

/** A UUID as the API writes it: 8-4-4-4-12 hexadecimal digits. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The card's id on the server, which the app sends back with an attempt. A checkpoint's is its
 * milestone's id. Optional: the bundled demo cards have none.
 */
const cardId = z.string().regex(UUID).optional();

/** An `https` URL with a host and no white space; nothing else is ever opened. */
const HTTPS_URL = /^https:\/\/[^\s/?#\\]+\S*$/;

/**
 * A source the card's node was built from (M6 hardening Task 12): its title, its `https` URL and
 * its licence (null when none was recorded). A card has at most 3; a source with another URL
 * fails its card. Optional: the bundled demo cards have none, and a checkpoint sends `[]`.
 */
export const sourceLinkSchema = z.object({
  title: text,
  url: z.string().regex(HTTPS_URL),
  license: text.nullable(),
});
const cardSources = z.array(sourceLinkSchema).max(3).optional();

/**
 * The exercise languages: the server's `Lang` (services/api/app/llm/resolve_model.py; kept in step
 * by services/api/tests/test_lang_sync.py). The app plays `strudel` and only checks the others (M6
 * hardening Task 8). An exercise in any other language is dropped.
 */
const EXERCISE_LANGS = ['strudel', 'sql', 'python', 'javascript', 'text'] as const;
const exerciseLang = z.enum(EXERCISE_LANGS);

/** Just enough of an exercise to read its language before the card itself is parsed. */
const exerciseLangSchema = z.object({ type: z.literal('exercise'), lang: z.string() });

/**
 * A set's topic. `lang` is the topic's code language as the API decides it (`strudel` for the
 * Strudel topic, whose cards play their code), null for a topic without one; absent from an older
 * API. Any string parses: only `strudel` changes what the app does (`selectPlaysStrudel`).
 */
export const topicSchema = z.object({
  slug: text,
  title: text,
  day: z.number().int().positive(),
  horizonDays: z.number().int().positive(),
  streak: count,
  progress: fraction,
  lang: z.string().nullable().optional(),
});

/** Rejects a choice card whose `correct` is not an index of its `options`. */
function correctIsAnOption(card: { options: string[]; correct: number }): boolean {
  return card.correct < card.options.length;
}

const correctOutOfRange = {
  message: '`correct` must be an index of `options`',
  path: ['correct'],
};

// Bold marking in card text (rule SS-11 in docs/standards.md). A card's prose fields may mark
// bold with a pair of `**`, as the design does (docs/design/card-feed/README.md:53, :118):
// "Wrap steps in **< >** and ...". Nothing else is markup, and an unpaired `**` is shown as
// typed. Only `apps/mobile/src/components/BoldText.tsx` renders it. The fields it applies to:
// - concept `body` (README.md:53)
// - quiz, predict, cloze, scenario and numeric `explanation` (README.md:73, :85; M9 plan C
//   Task 4; a numeric card bolds its answer, as `54 / 3.6 = **15**`)
// - review `answer` (README.md:118)
// - exercise `passMsg` and `failMsg`: prose shown to the learner beside the pass and fail badges
//   (README.md:107-108)
// Every other field is plain text: titles, `prompt`, `options`, `node`, the rating labels, the
// checkpoint rubric `label`s (short row labels, README.md:130-134), a cloze's `text`, a
// scenario's `situation` and a numeric card's `problem` (a source sentence, quoted word for word,
// a situation and a problem, each drawn as a passage), and every code field (`snippet`,
// `snippetComment`, `code`, `starterCode`), where `*` is Strudel syntax.
// A concept card's code is optional: a topic without Strudel may send none, and then the card
// draws no code block and no cycle tiles (M6 hardening Task 8).
const conceptCardSchema = z.object({
  id: cardId,
  sources: cardSources,
  type: z.literal('concept'),
  node: text,
  estSeconds: seconds,
  title: text,
  body: text,
  snippet: text.optional(),
  snippetComment: z.string().optional(),
  cycles: z.array(text).min(1).optional(),
  snippetStyle: z.enum(['code', 'quote']).optional(),
});

const quizCardSchema = z
  .object({
    id: cardId,
    sources: cardSources,
    type: z.literal('quiz'),
    node: text,
    estSeconds: seconds,
    title: text,
    options: z.array(text).min(2),
    correct: count,
    explanation: text,
  })
  .refine(correctIsAnOption, correctOutOfRange);

const predictCardSchema = z
  .object({
    id: cardId,
    sources: cardSources,
    type: z.literal('predict'),
    node: text,
    estSeconds: seconds,
    title: text,
    code: text,
    options: z.array(text).min(2),
    correct: count,
    explanation: text,
  })
  .refine(correctIsAnOption, correctOutOfRange);

// The choice cards that draw a passage above the options, each as a quiz: a prose topic's cloze (a
// sentence with a blank, `___`, to fill) and scenario (a situation to judge), M9 plan C, and a
// quantitative topic's numeric card (a problem to work out), M9 plan D. Each adds its passage
// field (`text`, `situation`, `problem`) to these shared fields.
const passageChoiceFields = {
  id: cardId,
  sources: cardSources,
  node: text,
  estSeconds: seconds,
  title: text,
  options: z.array(text).min(2),
  correct: count,
  explanation: text,
};

const clozeCardSchema = z
  .object({ ...passageChoiceFields, type: z.literal('cloze'), text })
  .refine(correctIsAnOption, correctOutOfRange);

const scenarioCardSchema = z
  .object({ ...passageChoiceFields, type: z.literal('scenario'), situation: text })
  .refine(correctIsAnOption, correctOutOfRange);

const numericCardSchema = z
  .object({ ...passageChoiceFields, type: z.literal('numeric'), problem: text })
  .refine(correctIsAnOption, correctOutOfRange);

const exerciseCardSchema = z.object({
  id: cardId,
  sources: cardSources,
  type: z.literal('exercise'),
  lang: exerciseLang,
  node: text,
  estSeconds: seconds,
  title: text,
  starterCode: z.string(),
  checks: z
    .array(
      z.object({
        kind: z.literal('contains'),
        value: text,
        ignoreWhitespace: z.boolean(),
      }),
    )
    .min(1),
  passMsg: text,
  failMsg: text,
  /**
   * The keypad of the card's editor (M9 plan K, keypadSchema.ts); null for a language without
   * keys, absent from the bundled demo cards and an older API.
   */
  keys: keypadSchema.nullable().optional(),
});

const reviewCardSchema = z.object({
  id: cardId,
  sources: cardSources,
  type: z.literal('review'),
  node: text,
  lastSeenDays: count,
  estSeconds: seconds,
  prompt: text,
  answer: text,
  snippet: text,
  snippetStyle: z.enum(['code', 'quote']).optional(),
  ratings: z.array(z.tuple([text, text])).min(1),
});

const checkpointCardSchema = z
  .object({
    id: cardId,
    sources: cardSources,
    type: z.literal('checkpoint'),
    milestone: z.number().int().positive(),
    milestoneCount: z.number().int().positive(),
    estSeconds: seconds,
    title: text,
    /**
     * The milestone's task (M9 plan J Task 8), served on every checkpoint; only a written card
     * draws it. Absent (the bundled demo cards, an older API) draws no task.
     */
    task: z.string().optional(),
    starterCode: z.string(),
    passThreshold: z.number().int().nonnegative(),
    rubric: z.array(z.object({ label: text, regex: text })),
    /**
     * True for a milestone without code checks (M9 plan J): the learner writes an answer, which
     * only the server grades. Absent (the bundled demo cards, an older API) reads as false.
     */
    written: z.boolean().optional(),
    /** The code editor's keypad, as on an exercise; a written card's is null. */
    keys: keypadSchema.nullable().optional(),
  })
  // A written card has no rubric; a code card has at least one row.
  .refine((card) => (card.written === true ? card.rubric.length === 0 : card.rubric.length >= 1), {
    message: 'a written checkpoint has no rubric rows, and a code checkpoint at least one',
    path: ['rubric'],
  })
  // A written card's threshold is 0. A code card's is 1 to its rubric size: above it, nobody can pass.
  .refine(
    (card) =>
      card.written === true
        ? card.passThreshold === 0
        : card.passThreshold >= 1 && card.passThreshold <= card.rubric.length,
    {
      message: '`passThreshold` must be 0 when written, else from 1 to the rubric size',
      path: ['passThreshold'],
    },
  );

export const cardSchema = z.discriminatedUnion('type', [
  conceptCardSchema,
  quizCardSchema,
  predictCardSchema,
  clozeCardSchema,
  scenarioCardSchema,
  numericCardSchema,
  exerciseCardSchema,
  reviewCardSchema,
  checkpointCardSchema,
]);

/**
 * A set's summary. `progressAfter` is the topic's progress after the set, which the API sends and
 * the bundled demo sets lack. `reminder` is null when the user set no reminder time.
 * `nextRecallMinutes` is the whole minutes until the topic's next recall comes due, null when
 * none is due later; the recorded summary has it, the feed's projected one sends null and the
 * demo sets lack it.
 */
export const summarySchema = z.object({
  title: text,
  progressDelta: z.number(),
  progressAfter: fraction.optional(),
  moved: z.array(z.tuple([text, fraction, fraction])),
  tomorrow: text,
  reminder: text.nullable(),
  nextRecallMinutes: z.number().int().positive().nullable().optional(),
});

const knownCardTypes: ReadonlySet<string> = new Set(
  cardSchema.options.map((option) => option.shape.type.value),
);

/** True for a card whose `type` is a string this app does not know, such as `"video"`. */
function hasUnknownType(item: unknown): boolean {
  if (typeof item !== 'object' || item === null || !('type' in item)) {
    return false;
  }
  return typeof item.type === 'string' && !knownCardTypes.has(item.type);
}

/**
 * True for an exercise whose `lang` is a string outside `EXERCISE_LANGS`: the app cannot check it,
 * so it is handled as a card of an unknown kind. Logged without the value, which is card data.
 */
function isForeignExercise(item: unknown): boolean {
  const exercise = exerciseLangSchema.safeParse(item);
  const foreign = exercise.success && !exerciseLang.safeParse(exercise.data.lang).success;
  if (foreign) {
    logWarning('exercise_lang_unknown');
  }
  return foreign;
}

/** A card the slot parser dropped, with the server id to record it as skipped by, if any. */
type Dropped = { droppedId: string | null };

/** True for a card with a server id: a UUID in `id`. */
function hasServerId(item: unknown): item is { id: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    typeof item.id === 'string' &&
    UUID.test(item.id)
  );
}

/**
 * The id to record a dropped card by: its server id, but not a checkpoint's, which is its
 * milestone's (the attempts endpoint takes cards only).
 */
function droppedIdOf(item: unknown): string | null {
  const isCheckpoint =
    typeof item === 'object' && item !== null && 'type' in item && item.type === 'checkpoint';
  return hasServerId(item) && !isCheckpoint ? item.id : null;
}

/** The paths at fault in a card, each once, joined for a log line: never their content. */
function faultPaths(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))].join('; ');
}

// One card slot. A card of an unknown type, or an exercise in a language the app does not know,
// is dropped and filtered out below, so newer content (or a set from another topic) does not break
// an older app. A card with a server id that fails its schema is dropped too, logged by the paths
// at fault, so one bad card from the API does not cost the whole set; a card without one (the
// bundled demo cards) fails the set. Each dropped card's id is kept, for the feed session to
// record it as skipped. Parsing slot by slot keeps each issue's path at the card's original index.
const cardSlotSchema = z.unknown().transform((item, ctx): Card | Dropped => {
  if (hasUnknownType(item) || isForeignExercise(item)) {
    return { droppedId: droppedIdOf(item) };
  }
  const result = cardSchema.safeParse(item);
  if (result.success) {
    return result.data;
  }
  if (hasServerId(item)) {
    logWarning('card_invalid', { paths: faultPaths(result.error) });
    return { droppedId: droppedIdOf(item) };
  }
  result.error.issues.forEach((issue) => {
    ctx.addIssue({ ...issue });
  });
  return z.NEVER;
});

type Slot = z.infer<typeof cardSlotSchema>;

/**
 * The set with its dropped cards taken out of `cards`; `droppedIds` names those with an id to
 * record, and is left out when there is none.
 */
function withoutDropped<T extends { cards: Slot[] }>({
  cards: slots,
  ...set
}: T): Omit<T, 'cards'> & { cards: Card[]; droppedIds?: string[] } {
  const cards: Card[] = [];
  const droppedIds: string[] = [];
  for (const slot of slots) {
    if (!('droppedId' in slot)) cards.push(slot);
    else if (slot.droppedId !== null) droppedIds.push(slot.droppedId);
  }
  return droppedIds.length > 0 ? { ...set, cards, droppedIds } : { ...set, cards };
}

/** A calendar date as the API writes it: `YYYY-MM-DD`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const feedSetShape = z.object({
  topic: topicSchema,
  setNumber: z.number().int().positive(),
  /**
   * The date the server stored the set for, in the user's timezone; an attempt at one of its
   * cards names it. Optional: the bundled demo sets have none (the API source requires it).
   */
  feedDate: z.string().regex(ISO_DATE).optional(),
  cards: z.array(cardSlotSchema),
  summary: summarySchema,
});

export const feedSetSchema = feedSetShape.transform(withoutDropped);

/** A set from the API: the demo sets' schema, with the date the server stored the set for. */
export const apiSetSchema = feedSetShape.required({ feedDate: true }).transform(withoutDropped);

// The placement quiz (`GET /topics/{slug}/placement`, K19): a topic's bands, one per milestone
// in order, and at most 8 quiz or predict cards. A placement card carries no answer index and no
// explanation: the server grades. `prompt` is a predict card's code (shown in a code block) and
// null for a quiz. Every field is plain text (rule SS-11).
const placementBandSchema = z.object({ milestone: z.number().int().positive(), title: text });

const placementCardSchema = z
  .object({
    id: z.string().regex(UUID),
    type: z.enum(['quiz', 'predict']),
    milestone: z.number().int().positive(),
    bandIndex: count,
    title: text,
    prompt: text.nullable(),
    options: z.array(text).min(2),
  })
  .refine((card) => card.type === 'quiz' || card.prompt !== null, {
    message: 'a predict card needs its code',
    path: ['prompt'],
  });

/** The most cards a placement set holds (K19). */
const PLACEMENT_MAX_CARDS = 8;

export const placementQuizSchema = z.object({
  bands: z.array(placementBandSchema),
  cards: z.array(placementCardSchema).max(PLACEMENT_MAX_CARDS),
});

/**
 * Where a placement put the learner: `placed` leading bands passed, out of `bands`.
 * `milestoneTitle` is the title of the band the learner starts at, null when none was passed.
 */
export const placementResultSchema = z.object({
  placed: count,
  bands: count,
  knownNodes: count,
  milestoneTitle: text.nullable(),
});

export type PlacementCard = z.infer<typeof placementCardSchema>;
export type PlacementQuiz = z.infer<typeof placementQuizSchema>;
export type PlacementResult = z.infer<typeof placementResultSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Card = z.infer<typeof cardSchema>;
export type ConceptCard = z.infer<typeof conceptCardSchema>;
export type QuizCard = z.infer<typeof quizCardSchema>;
export type PredictCard = z.infer<typeof predictCardSchema>;
export type ClozeCard = z.infer<typeof clozeCardSchema>;
export type ScenarioCard = z.infer<typeof scenarioCardSchema>;
export type NumericCard = z.infer<typeof numericCardSchema>;
export type ExerciseCard = z.infer<typeof exerciseCardSchema>;
export type ReviewCard = z.infer<typeof reviewCardSchema>;
export type CheckpointCard = z.infer<typeof checkpointCardSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type SourceLink = z.infer<typeof sourceLinkSchema>;
export type FeedSet = z.infer<typeof feedSetSchema>;
