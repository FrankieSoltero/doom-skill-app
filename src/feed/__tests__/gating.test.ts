import type { CheckpointGrade } from '../checkpoint';
import { isAnswered } from '../gating';
import { cardsByType } from '../testing/sets';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

const failedGrade: CheckpointGrade = { results: [], passCount: 0, passed: false, feedback: 'fail' };
const passedGrade: CheckpointGrade = { results: [], passCount: 1, passed: true, feedback: 'all' };

describe('isAnswered for concept and choice cards', () => {
  it('treats a concept card as answered with or without an answer', () => {
    expect(isAnswered(concept, undefined)).toBe(true);
    expect(isAnswered(concept, { kind: 'choice', picked: 0 })).toBe(true);
  });

  it.each([quiz, predict])('needs a pick on a $type card', (card) => {
    expect(isAnswered(card, undefined)).toBe(false);
    expect(isAnswered(card, { kind: 'choice', picked: 1 })).toBe(true);
  });
});

describe('isAnswered for exercise cards', () => {
  it('is not answered without a result or after a failed run', () => {
    expect(isAnswered(exercise, undefined)).toBe(false);
    expect(isAnswered(exercise, { kind: 'exercise', code: '', result: null })).toBe(false);
    expect(isAnswered(exercise, { kind: 'exercise', code: 's("bd")', result: 'fail' })).toBe(false);
  });

  it('is answered after a passing run', () => {
    expect(isAnswered(exercise, { kind: 'exercise', code: 's("bd sd")', result: 'pass' })).toBe(
      true,
    );
  });

  it('is not answered when a choice answer is stored against it', () => {
    expect(isAnswered(exercise, { kind: 'choice', picked: 0 })).toBe(false);
  });
});

describe('isAnswered for review cards', () => {
  it('is not answered while revealed but not rated', () => {
    expect(isAnswered(review, undefined)).toBe(false);
    expect(isAnswered(review, { kind: 'review', revealed: true, rating: null })).toBe(false);
  });

  it('is answered once rated, including the lowest rating', () => {
    expect(isAnswered(review, { kind: 'review', revealed: true, rating: 0 })).toBe(true);
    expect(isAnswered(review, { kind: 'review', revealed: true, rating: 3 })).toBe(true);
  });
});

describe('isAnswered for checkpoint cards', () => {
  it.each(['idle', 'grading'] as const)('is not answered while %s', (status) => {
    expect(isAnswered(checkpoint, { kind: 'checkpoint', code: '', status, grade: null })).toBe(
      false,
    );
  });

  it.each([failedGrade, passedGrade])('is answered when done, passed: $passed', (grade) => {
    expect(isAnswered(checkpoint, { kind: 'checkpoint', code: '', status: 'done', grade })).toBe(
      true,
    );
  });

  it('is not answered without an answer or with another kind', () => {
    expect(isAnswered(checkpoint, undefined)).toBe(false);
    expect(isAnswered(checkpoint, { kind: 'review', revealed: true, rating: 2 })).toBe(false);
  });
});
