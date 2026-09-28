// The card data contract (rule SS-7): every card type in the app is inferred from these zod
// schemas. Objects are parsed with zod's default strip mode, so keys a schema does not name
// (such as the fixture's `tree`) are dropped rather than rejected.
import { z } from 'zod';

const text = z.string().min(1);
const count = z.number().int().nonnegative();
const seconds = z.number().int().positive();
const fraction = z.number().min(0).max(1);

export const topicSchema = z.object({
  slug: text,
  title: text,
  day: z.number().int().positive(),
  horizonDays: z.number().int().positive(),
  streak: count,
  progress: fraction,
});

/** Rejects a choice card whose `correct` is not an index of its `options`. */
function correctIsAnOption(card: { options: string[]; correct: number }): boolean {
  return card.correct < card.options.length;
}

const correctOutOfRange = {
  message: '`correct` must be an index of `options`',
  path: ['correct'],
};

const conceptCardSchema = z.object({
  type: z.literal('concept'),
  node: text,
  estSeconds: seconds,
  title: text,
  body: text,
  snippet: text,
  snippetComment: z.string(),
  cycles: z.array(text).min(1),
});

const quizCardSchema = z
  .object({
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

const exerciseCardSchema = z.object({
  type: z.literal('exercise'),
  lang: text,
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
});

const reviewCardSchema = z.object({
  type: z.literal('review'),
  node: text,
  lastSeenDays: count,
  estSeconds: seconds,
  prompt: text,
  answer: text,
  snippet: text,
  ratings: z.array(z.tuple([text, text])).min(1),
});

const checkpointCardSchema = z.object({
  type: z.literal('checkpoint'),
  milestone: z.number().int().positive(),
  milestoneCount: z.number().int().positive(),
  estSeconds: seconds,
  title: text,
  starterCode: z.string(),
  passThreshold: z.number().int().positive(),
  rubric: z.array(z.object({ label: text, regex: text })).min(1),
});

export const cardSchema = z.discriminatedUnion('type', [
  conceptCardSchema,
  quizCardSchema,
  predictCardSchema,
  exerciseCardSchema,
  reviewCardSchema,
  checkpointCardSchema,
]);

export const summarySchema = z.object({
  title: text,
  progressDelta: z.number(),
  moved: z.array(z.tuple([text, fraction, fraction])),
  tomorrow: text,
  reminder: text,
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

// One card slot. A card of an unknown type becomes `null` and is filtered out below, so newer
// content does not break an older app. Parsing slot by slot keeps each issue's path at the card's
// original index.
const cardSlotSchema = z.unknown().transform((item, ctx): Card | null => {
  if (hasUnknownType(item)) {
    return null;
  }
  const result = cardSchema.safeParse(item);
  if (!result.success) {
    result.error.issues.forEach((issue) => {
      ctx.addIssue({ ...issue });
    });
    return z.NEVER;
  }
  return result.data;
});

export const feedSetSchema = z.object({
  topic: topicSchema,
  setNumber: z.number().int().positive(),
  cards: z.array(cardSlotSchema).transform((slots) => slots.filter((card) => card !== null)),
  summary: summarySchema,
});

export type Topic = z.infer<typeof topicSchema>;
export type Card = z.infer<typeof cardSchema>;
export type ConceptCard = z.infer<typeof conceptCardSchema>;
export type QuizCard = z.infer<typeof quizCardSchema>;
export type PredictCard = z.infer<typeof predictCardSchema>;
export type ExerciseCard = z.infer<typeof exerciseCardSchema>;
export type ReviewCard = z.infer<typeof reviewCardSchema>;
export type CheckpointCard = z.infer<typeof checkpointCardSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type FeedSet = z.infer<typeof feedSetSchema>;
