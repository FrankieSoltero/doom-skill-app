// What the learner has done on each card of a set, by card kind. Pure types, no rendering.
import type { CheckpointGrade } from './checkpoint';

/** The learner's answer to one card. `kind` names the card family the answer belongs to. */
export type CardAnswer =
  | { kind: 'choice'; picked: number }
  | { kind: 'exercise'; code: string; result: 'pass' | 'fail' | null }
  | { kind: 'review'; revealed: boolean; rating: 0 | 1 | 2 | 3 | null }
  | {
      kind: 'checkpoint';
      /** The code, or a written checkpoint's answer. */
      code: string;
      /** `sent`: a written answer posted for the server's grade, with no grade on the phone. */
      status: 'idle' | 'grading' | 'done' | 'sent';
      grade: CheckpointGrade | null;
    };
