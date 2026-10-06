// A served card's place in a two-card sequence (M10 plan T, spec 3.1).
import { z } from 'zod';

/**
 * `{ index, of }` of a card that is half of a split pair, such as 1 of 2. The server omits the key
 * outside a sequence (it never sends null), so the field is `.optional()`, never `.default()`:
 * a card without it must parse to a card without it (the fixture-equality tests).
 */
export const sequenceSchema = z.object({
  index: z.number().int().min(1),
  of: z.number().int().min(2),
});
