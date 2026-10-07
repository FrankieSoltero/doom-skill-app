/**
 * The display-name rule (M10 plan P, spec 3.2), checked in the app before `PATCH /me` so the name
 * field can say why a name is refused without a request. The API is the rule's enforcer
 * (`services/api/app/services/display_names.py`); this copy of its shape only saves a round trip.
 * Whether a name is taken or banned only the API knows.
 */

/** The shortest display name. */
export const NAME_MIN = 3;
/** The longest display name. */
export const NAME_MAX = 24;
/** The API's `NAME_PATTERN`: letters, digits, spaces and `_`, no leading or trailing space. */
export const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_ ]{1,22}[A-Za-z0-9_]$/;

/**
 * Why the trimmed `name` breaks the rule, or `null` when it does not. An empty name clears the
 * display name, which is allowed, so it has no problem.
 */
export function nameProblem(name: string): 'short' | 'long' | 'chars' | null {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  if (trimmed.length < NAME_MIN) return 'short';
  if (trimmed.length > NAME_MAX) return 'long';
  return NAME_PATTERN.test(trimmed) ? null : 'chars';
}
