/**
 * The active topic: the topic the Today feed asks the API for (`activeTopic()`, which the API card
 * source reads on every request, src/data/index.ts), chosen by enrolling (`setActive`).
 *
 * - It is kept in async storage under `activeTopic` as `{"owner", "slug"}`, read once when this
 *   module loads (`loaded` turns true then, whatever the read gave). It belongs to the user who
 *   chose it: for anyone else it reads as none, so a topic is never asked for under another
 *   user's account. Signing out forgets it, here and in storage.
 * - A stored value that does not fit (not JSON, the wrong shape, a slug the API would refuse)
 *   reads as none. A storage failure is logged by its class name; a topic that could not be
 *   stored still holds for this run.
 * - Choosing a different topic resets the feed store first, so the feed starts the new topic
 *   instead of resuming the old topic's set.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { onSignOut, useSession } from '../auth/useSession';
import { logWarning } from '../log';
import { useFeedStore } from './store';

const STORAGE_KEY = 'activeTopic';

/** The API's slug pattern (`GET /topics/{slug}`). */
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The stored choice: the topic, and the user who chose it (`null` with the demo sets). */
type Choice = { owner: string | null; slug: string };

type State = { choice: Choice | null; loaded: boolean };

const useChoice = create<State>()(() => ({ choice: null, loaded: false }));

function kindOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** The choice's slug when it belongs to `userId`, else `null`. */
function slugFor(choice: Choice | null, userId: string | null): string | null {
  return choice !== null && choice.owner === userId ? choice.slug : null;
}

/** `text` as a stored choice, or `null` when it does not fit. */
function parseChoice(text: string): Choice | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { owner, slug } = value as Record<string, unknown>;
    const ownerFits = owner === null || typeof owner === 'string';
    return ownerFits && typeof slug === 'string' && SLUG.test(slug) ? { owner, slug } : null;
  } catch {
    return null;
  }
}

/** Reads the stored choice (see the module comment). Runs once when this module loads. */
export async function loadActiveTopic(): Promise<void> {
  let choice: Choice | null = null;
  try {
    const text = await AsyncStorage.getItem(STORAGE_KEY);
    choice = text === null ? null : parseChoice(text);
    if (text !== null && choice === null) logWarning('active_topic_invalid', {});
  } catch (error) {
    logWarning('active_topic_read_failed', { kind: kindOf(error) });
  }
  useChoice.setState({ choice, loaded: true });
}

/** The signed-in user's active topic, or `null`. Read by the API card source on every request. */
export function activeTopic(): string | null {
  return slugFor(useChoice.getState().choice, useSession.getState().userId);
}

/** Makes `slug` the signed-in user's active topic and stores it (see the module comment). */
async function setActive(slug: string): Promise<void> {
  if (activeTopic() !== slug) useFeedStore.getState().reset();
  const choice: Choice = { owner: useSession.getState().userId, slug };
  useChoice.setState({ choice, loaded: true });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch (error) {
    logWarning('active_topic_write_failed', { kind: kindOf(error) });
  }
}

/** The active topic for a screen: its slug, whether it has been read, and `setActive`. */
export function useActiveTopic() {
  const choice = useChoice((state) => state.choice);
  const loaded = useChoice((state) => state.loaded);
  const userId = useSession((state) => state.userId);
  return { slug: slugFor(choice, userId), loaded, setActive };
}

onSignOut(() => {
  useChoice.setState({ choice: null, loaded: true });
  AsyncStorage.removeItem(STORAGE_KEY).catch((error: unknown) => {
    logWarning('active_topic_remove_failed', { kind: kindOf(error) });
  });
});

void loadActiveTopic();
