// The API's feed response in the app's key style. The API writes snake_case keys
// (`set_number`, `est_seconds`) and the card schema reads camelCase (`setNumber`, `estSeconds`).

/** `snake_case` → `snakeCase`. */
function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (match) => match.charAt(1).toUpperCase());
}

/**
 * True for the `cycles` of a concept card that has none: a topic without Strudel (card_gen_v3)
 * serves `[]`, and the schema reads a concept card with no cycles by their absence.
 */
function isEmptyConceptCycles(object: object, key: string, value: unknown): boolean {
  return (
    key === 'cycles' &&
    'type' in object &&
    object.type === 'concept' &&
    Array.isArray(value) &&
    value.length === 0
  );
}

/**
 * `response` with every object key, at any depth, in camelCase, and nothing else changed but one:
 * a concept card's empty `cycles` list is left out (see `isEmptyConceptCycles`). Arrays stay arrays
 * (a review's `ratings` pairs, the summary's `moved` triples), objects inside them are mapped, and
 * every other value is kept as sent. The result is still untrusted: it goes through
 * `feedSetSchema` next.
 */
export function mapFeed(response: unknown): unknown {
  if (Array.isArray(response)) {
    return response.map(mapFeed);
  }
  if (typeof response === 'object' && response !== null) {
    return Object.fromEntries(
      Object.entries(response)
        .filter(([key, value]) => !isEmptyConceptCycles(response, key, value))
        .map(([key, value]) => [camelKey(key), mapFeed(value)]),
    );
  }
  return response;
}
