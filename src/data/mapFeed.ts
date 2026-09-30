// The API's feed response in the app's key style. The API writes snake_case keys
// (`set_number`, `est_seconds`) and the card schema reads camelCase (`setNumber`, `estSeconds`).

/** `snake_case` → `snakeCase`. */
function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (match) => match.charAt(1).toUpperCase());
}

/**
 * `response` with every object key, at any depth, in camelCase, and nothing else changed: arrays
 * stay arrays (a review's `ratings` pairs, the summary's `moved` triples), objects inside them are
 * mapped, and every value is kept as sent. The result is still untrusted: it goes through
 * `feedSetSchema` next.
 */
export function mapFeed(response: unknown): unknown {
  if (Array.isArray(response)) {
    return response.map(mapFeed);
  }
  if (typeof response === 'object' && response !== null) {
    return Object.fromEntries(
      Object.entries(response).map(([key, value]) => [camelKey(key), mapFeed(value)]),
    );
  }
  return response;
}
