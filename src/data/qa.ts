// The peer questions of a card and the learner's questions inbox through the API (M10 plan Q
// Task 8; spec 3.4): ask a question on a card (its passages come back with it), read a card's
// questions and the inbox, answer, accept, mark helpful, flag and delete. Each reply is untrusted:
// its keys are mapped and it is parsed with a zod mirror of the generated type (`parsed`, as the
// feed's card actions are) before a screen sees it. A refused POST rejects with the client's
// ApiError, which `qaOutcome` reads as the line the screen shows.
import { z } from 'zod';

import type { createApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { parsed, passageSchema } from './feedActions';

type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Who wrote a question or an answer: the display name when they opted in, else null, and their
 * highest level under the question's root (1 when none; plan L decision L15).
 */
const authorSchema = z.object({ name: z.string().nullable(), level: z.number().int().min(1) });

/** One answer to a question (`AnswerOut`); a hidden one reaches its author only. */
const answerSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['visible', 'hidden']),
  createdAt: z.string(),
  author: authorSchema,
  mine: z.boolean(),
  helpfulCount: z.number().int().nonnegative(),
  helpfulByMe: z.boolean(),
  accepted: z.boolean(),
});

/** A question on a card and its answers (`QuestionOut`, plan Q decision Q8). */
const questionSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  topicId: z.string(),
  text: z.string(),
  status: z.enum(['open', 'answered', 'hidden']),
  createdAt: z.string(),
  author: authorSchema,
  mine: z.boolean(),
  acceptedAnswerId: z.string().nullable(),
  answers: z.array(answerSchema),
});

/** A passage found for an asked question (`AskPassage`): an `https` source, as a card's are. */
const askPassageSchema = passageSchema.pick({ text: true, source: true });

/** The asked question and the passages found for it (`AskOut`). */
const askSchema = z.object({ question: questionSchema, passages: z.array(askPassageSchema) });

/** A card's questions (`QuestionList`). */
const questionListSchema = z.object({ questions: z.array(questionSchema) });

/** The learner's inbox (`Inbox`, decision Q4). */
const inboxSchema = z.object({
  toAnswer: z.array(questionSchema),
  answered: z.array(questionSchema),
  badge: z.number().int().nonnegative(),
});

export type Author = z.infer<typeof authorSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Question = z.infer<typeof questionSchema>;
export type AskPassage = z.infer<typeof askPassageSchema>;
export type AskResult = z.infer<typeof askSchema>;
export type Inbox = z.infer<typeof inboxSchema>;

/** Why a learner flags a question or an answer: one of the API's four reasons. */
export type QaFlagReason = components['schemas']['QaFlagReason'];

/**
 * What a Q&A request came to: `ok`, or the refusal a screen shows a line for (decision Q8's fixed
 * errors: the day's limit, not allowed, text refused, gone, already accepted).
 */
export type QaOutcome =
  'ok' | 'rateLimited' | 'notAllowed' | 'textRefused' | 'notFound' | 'conflict';

/**
 * Asks a question on a card (`POST /cards/{card_id}/questions`) and reads it back with the
 * passages found for it. Sent once: the client never retries a POST. Rejects with the client's
 * ApiError on a failure, a FeedActionError for a reply the schema refuses.
 */
export async function ask(api: ApiClient, cardId: string, text: string): Promise<AskResult> {
  const { data } = await api.POST('/cards/{card_id}/questions', {
    params: { path: { card_id: cardId } },
    body: { text },
  });
  return parsed(askSchema, data, 'ask_invalid');
}

/** A card's questions, newest first (`GET /cards/{card_id}/questions`). Rejects as `ask` does. */
export async function listCardQuestions(api: ApiClient, cardId: string): Promise<Question[]> {
  const { data } = await api.GET('/cards/{card_id}/questions', {
    params: { path: { card_id: cardId } },
  });
  return parsed(questionListSchema, data, 'questions_invalid').questions;
}

/**
 * The learner's inbox (`GET /questions/inbox`): the questions they can answer, their own questions
 * that have an answer, and the badge count. `signal` cancels the request (the query's own).
 */
export async function fetchInbox(api: ApiClient, signal?: AbortSignal): Promise<Inbox> {
  const { data } = await api.GET('/questions/inbox', signal === undefined ? {} : { signal });
  return parsed(inboxSchema, data, 'inbox_invalid');
}

/** Marks the inbox seen now (`POST /questions/inbox/seen`, a 204), which clears the badge. */
export async function markInboxSeen(api: ApiClient): Promise<void> {
  await api.POST('/questions/inbox/seen');
}

/** Answers a question (`POST /questions/{question_id}/answers`) and reads the question back. */
export async function answerQuestion(
  api: ApiClient,
  questionId: string,
  text: string,
): Promise<Question> {
  const { data } = await api.POST('/questions/{question_id}/answers', {
    params: { path: { question_id: questionId } },
    body: { text },
  });
  return parsed(questionSchema, data, 'question_invalid');
}

/** The asker accepts an answer (`POST /questions/{question_id}/accept`); the question back. */
export async function acceptAnswer(
  api: ApiClient,
  questionId: string,
  answerId: string,
): Promise<Question> {
  const { data } = await api.POST('/questions/{question_id}/accept', {
    params: { path: { question_id: questionId } },
    body: { answer_id: answerId },
  });
  return parsed(questionSchema, data, 'question_invalid');
}

/** Marks an answer helpful (`POST /answers/{answer_id}/helpful`) and reads the answer back. */
export async function markHelpful(api: ApiClient, answerId: string): Promise<Answer> {
  const { data } = await api.POST('/answers/{answer_id}/helpful', {
    params: { path: { answer_id: answerId } },
  });
  return parsed(answerSchema, data, 'answer_invalid');
}

/** Flags a question (`POST /questions/{question_id}/flag`, a 204). */
export async function flagQuestion(
  api: ApiClient,
  questionId: string,
  reason: QaFlagReason,
): Promise<void> {
  await api.POST('/questions/{question_id}/flag', {
    params: { path: { question_id: questionId } },
    body: { reason },
  });
}

/** Flags an answer (`POST /answers/{answer_id}/flag`, a 204). */
export async function flagAnswer(
  api: ApiClient,
  answerId: string,
  reason: QaFlagReason,
): Promise<void> {
  await api.POST('/answers/{answer_id}/flag', {
    params: { path: { answer_id: answerId } },
    body: { reason },
  });
}

/** Deletes the learner's own question (`DELETE /questions/{question_id}`, a 204; decision Q16). */
export async function deleteQuestion(api: ApiClient, questionId: string): Promise<void> {
  await api.DELETE('/questions/{question_id}', {
    params: { path: { question_id: questionId } },
  });
}

/** Deletes the learner's own answer (`DELETE /answers/{answer_id}`, a 204; decision Q16). */
export async function deleteAnswer(api: ApiClient, answerId: string): Promise<void> {
  await api.DELETE('/answers/{answer_id}', { params: { path: { answer_id: answerId } } });
}

/**
 * The outcome an ApiError's status reads as. By status, not kind: the client gives a 403 the kind
 * `unauthorized` and a 422 the kind `invalid`, which both name other failures too.
 */
const OUTCOME_BY_STATUS: Readonly<Record<number, QaOutcome>> = {
  403: 'notAllowed',
  404: 'notFound',
  409: 'conflict',
  422: 'textRefused',
  429: 'rateLimited',
};

/**
 * The outcome a failed Q&A request reads as, or null for anything else (another status, no
 * network, a time-out, a refused reply, not an ApiError), which the caller re-throws.
 */
export function qaOutcome(error: unknown): QaOutcome | null {
  if (!(error instanceof ApiError)) return null;
  return OUTCOME_BY_STATUS[error.status] ?? null;
}
