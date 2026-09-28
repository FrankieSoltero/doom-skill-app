/**
 * The one home of UI strings that do not come from card data (rule SS-8 in docs/standards.md).
 * Screens and components read their text from `copy` instead of writing it inline.
 *
 * Plain strings are values. A string that needs data is a function that returns the string, for
 * example `cardsLeft: (count: number) => ...`. Related strings may be grouped in nested objects;
 * `deepFreeze` freezes every level, and `as const` makes every level read-only to the compiler.
 */

/** Freezes every nested object under `value`. Functions and primitives are left as they are. */
function freezeChildren(value: object): void {
  const children: unknown[] = Object.values(value);
  for (const child of children) {
    if (typeof child === 'object' && child !== null) {
      freezeChildren(child);
      Object.freeze(child);
    }
  }
}

/** Freezes `value` and every object nested in it, so no level can be changed at run time. */
function deepFreeze<T extends object>(value: T): Readonly<T> {
  freezeChildren(value);
  return Object.freeze(value);
}

export const copy = deepFreeze({
  appName: 'LearnLoop',
} as const);
