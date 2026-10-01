/**
 * Deleting the signed-in user's account: `DELETE /me` with the body `{"confirm": "delete"}`
 * (M6 hardening plan, Task 9). The server deletes the account and everything that names the user,
 * and answers 204.
 *
 * On a 204 the device is signed out with `signOut` (src/auth/useSession.ts), which removes the
 * stored session (src/auth/secureSession.ts) and clears the user's data: the feed store, the
 * server-state cache and the daily reminder (its `onSignOut` listeners), and the attempt outbox,
 * which drops its queue and every stored one when the signed-in user changes. The root layout's
 * guards then show the sign-in screen. Any failure (a 503 while the auth service is down, no
 * network, a 401) leaves the user signed in and the hook's status `error`; the failure's class
 * name is logged, nothing else.
 */
import { useMutation } from '@tanstack/react-query';

import { MUTATION_STATUS, requireApi } from '../api/query';
import { signOut } from '../auth/useSession';
import { logWarning } from '../log';

/** The exact confirmation the API takes. */
const CONFIRM = 'delete';

/** Deletes the account (see the module comment). */
export function useDeleteAccount() {
  const mutation = useMutation({
    mutationFn: async () => {
      await requireApi().DELETE('/me', { body: { confirm: CONFIRM } });
      await signOut();
    },
    onError: (error) => {
      logWarning('account_delete_failed', { kind: error.name });
    },
  });
  return {
    /** Starts the deletion; the outcome is `status`. */
    deleteAccount: () => {
      mutation.mutate();
    },
    status: MUTATION_STATUS[mutation.status],
  };
}
