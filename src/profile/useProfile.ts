/**
 * The signed-in user's profile for the Profile tab: read with `GET /me` (the cached query of
 * src/profile/me.ts) and changed with `PATCH /me`, which takes only the fields given. The answer
 * to a change replaces the cached profile. A refused change rejects with its `ApiError` and leaves
 * the profile as it was.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../api/errors';
import { asApiError, requireApi } from '../api/query';
import type { components } from '../api/schema';
import { fetchMe, ME_KEY, type Profile } from './me';

export type ProfilePatch = components['schemas']['ProfileUpdate'];

type ProfileState = {
  status: 'loading' | 'ready' | 'error';
  profile?: Profile;
  error?: ApiError;
  /** Changes the fields in `patch` (see the module comment). */
  update: (patch: ProfilePatch) => Promise<void>;
  /** Asks again, after an error. */
  retry: () => void;
};

/** The device's timezone, an IANA name, which the profile offers to use. */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The profile (see the module comment). */
export function useProfile(): ProfileState {
  const cache = useQueryClient();
  const result = useQuery({ queryKey: ME_KEY, queryFn: ({ signal }) => fetchMe(signal) });
  const update = async (patch: ProfilePatch) => {
    const { data } = await requireApi().PATCH('/me', { body: patch });
    if (data !== undefined) cache.setQueryData(ME_KEY, data);
  };
  const retry = () => {
    void result.refetch();
  };

  if (result.isSuccess) return { status: 'ready', profile: result.data, update, retry };
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', error, update, retry };
  return { status: 'loading', update, retry };
}
