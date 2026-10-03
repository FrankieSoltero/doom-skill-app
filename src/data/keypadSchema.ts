// A code card's keypad (M9 plan K; spec 3.1, 3.2), as the API serves it on an exercise or a
// checkpoint card (`keys`, services/api/app/keys/build.py). Kept apart from schema.ts, which
// imports `keypadSchema` for those two cards, to keep that file within TS-4.
import { z } from 'zod';

/**
 * One key: the `label` it shows (1 to 12 characters), the text it `insert`s (1 to 40), and where
 * the caret lands: `caret` characters before the end of the inserted text (`s("")` with 2 leaves
 * it between the quotes, `.fast(` with 0 after the bracket). A caret past the start is refused.
 */
export const keySpecSchema = z
  .object({
    label: z.string().min(1).max(12),
    insert: z.string().min(1).max(40),
    caret: z.number().int().nonnegative(),
  })
  .refine((k) => k.caret <= k.insert.length, {
    message: 'caret must not exceed the insert length',
    path: ['caret'],
  });

/** A row of keys: the node's `calls` and `methods`, the language's `notation` and `digits`. */
export const keyGroupSchema = z.object({
  name: z.enum(['calls', 'notation', 'methods', 'digits']),
  keys: z.array(keySpecSchema).min(1).max(12),
});

/**
 * The keypad: its groups, in the order served (a group with no keys is not sent), and what its
 * action key does, `run` on an exercise and `submit` on a checkpoint.
 */
export const keypadSchema = z.object({
  groups: z.array(keyGroupSchema).max(4),
  action: z.enum(['run', 'submit']),
});

export type Keypad = z.infer<typeof keypadSchema>;
export type KeySpec = z.infer<typeof keySpecSchema>;
