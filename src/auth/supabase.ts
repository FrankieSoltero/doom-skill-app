/**
 * The app's one Supabase client, used for sign-in and the session only; the API is called through
 * its own client. It is built from the configured project URL and anon key (src/config.ts, which
 * already requires `https` outside a development build) and keeps its session in `secureSession`,
 * encrypted at rest.
 *
 * `null` with the fixture source, which needs no account, and when the configuration has a
 * problem: the root layout then shows the configuration message, and nothing may call Supabase
 * with a missing or refused URL.
 *
 * - `autoRefreshToken`: the client refreshes the access token before it expires. React Native has
 *   no page visibility, so `useSession` starts and stops the refresh with the app's state.
 * - `detectSessionInUrl: false`: there is no browser URL to read a session from. A token is never
 *   put in a URL.
 */
import { createClient } from '@supabase/supabase-js';

import { config, configError } from '../config';
import { secureSession } from './secureSession';

/**
 * The name the session is stored under. Fixed, not derived from the project URL, so the app can
 * remove the stored session itself when a sign-out cannot reach Supabase (`useSession`).
 */
export const SESSION_STORAGE_KEY = 'learnloop.session';

function makeClient() {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureSession,
      storageKey: SESSION_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/** The client, or `null` when the app does not use Supabase (see the module comment). */
export const supabase: ReturnType<typeof makeClient> | null =
  config.dataSource === 'api' && configError === null ? makeClient() : null;
