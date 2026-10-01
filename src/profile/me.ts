/**
 * The signed-in user's profile (`GET /me`) as one cached query, shared by the Profile tab and by
 * enrolling, which reads the profile's daily minutes.
 */
import { requireApi } from '../api/query';
import type { components } from '../api/schema';

export type Profile = components['schemas']['Profile'];

/** The profile's key in the server-state cache. */
export const ME_KEY = ['me'] as const;

/** Reads the profile. Fails with the request's `ApiError`. */
export async function fetchMe(signal?: AbortSignal): Promise<Profile> {
  const { data } = await requireApi().GET('/me', signal === undefined ? {} : { signal });
  if (data === undefined) throw new Error('The profile request gave no body');
  return data;
}
