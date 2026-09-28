// What the learner has done on each card of a set, by card kind. Pure types, no rendering.
import type { CheckpointGrade } from './checkpoint';

/** The learner's answer to one card. `kind` names the card family the answer belongs to. */
export type CardAnswer =
  | { kind: 'choice'; picked: number }
  | { kind: 'exercise'; code: string; result: 'pass' | 'fail' | null }
  | { kind: 'review'; revealed: boolean; rating: 0 | 1 | 2 | 3 | null }
  | {
      kind: 'checkpoint';
      code: string;
      status: 'idle' | 'grading' | 'done';
      grade: CheckpointGrade | null;
    };
