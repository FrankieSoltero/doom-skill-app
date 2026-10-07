/**
 * The learner's questions inbox (`GET /questions/inbox`, M10 plan Q decisions Q4 and Q12) through
 * the server-state cache: the questions they can answer, their own questions that have an answer,
 * and the badge count. One query feeds the tab bar's badge and the Questions screen.
 *
 * - It asks again every `INBOX_POLL_MS` while the app is in the foreground (`useAppActive`), not
 *   while it is in the background.
 * - It asks at once when the app returns to the foreground: React Native has no window focus, so
 *   `refetchOnWindowFocus` alone would not.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { ApiError } from '../api/errors';
import { asApiError, requireApi } from '../api/query';
import { fetchInbox, type Inbox } from '../data/qa';
import { useAppActive } from './useAppActive';

/** Between two inbox requests while the app is in the foreground. */
export const INBOX_POLL_MS = 60_000;

/** The inbox's query key, which the Questions screen invalidates after marking it seen. */
export const INBOX_KEY = ['inbox'] as const;

type InboxState = {
  status: 'loading' | 'ready' | 'error';
  inbox?: Inbox;
  error?: ApiError;
  /** Asks again, after an error. */
  retry: () => void;
  /** The count of new items: the inbox's badge, 0 until it loads. */
  badge: number;
};

/** The inbox (see the module comment). */
export function useInbox(): InboxState {
  const active = useAppActive();
  const result = useQuery({
    queryKey: INBOX_KEY,
    queryFn: ({ signal }) => fetchInbox(requireApi(), signal),
    refetchInterval: active ? INBOX_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
  const { refetch } = result;
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) void refetch();
    wasActive.current = active;
  }, [active, refetch]);

  const retry = () => {
    void refetch();
  };
  if (result.isSuccess) {
    return { status: 'ready', inbox: result.data, retry, badge: result.data.badge };
  }
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', error, retry, badge: 0 };
  return { status: 'loading', retry, badge: 0 };
}
