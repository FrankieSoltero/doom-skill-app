// The app's outbox (src/feed/outbox.ts, `outbox`): wired to the API client, async storage, the
// app's foreground and sign-out, and installed as the feed store's attempt sink. Each case loads
// the modules afresh. The API client is the real one over a fake network: nothing leaves the test.
import type { AppStateStatus } from 'react-native';

import type { FeedSet } from '../../data';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

// Read by the mocked client module when a case loads it.
const mockSend = jest.fn<Promise<Response>, [Request]>();
const mockRefresh = jest.fn(() => Promise.resolve(true));

jest.mock('../../api/client', () => {
  const actual = jest.requireActual<typeof import('../../api/client')>('../../api/client');
  const api = actual.createApiClient({
    baseUrl: 'https://api.test',
    send: (request) => mockSend(request),
    sleep: () => Promise.resolve(),
    getAccessToken: () => Promise.resolve('token-marker'),
    refreshSession: () => mockRefresh(),
    signOut: () => Promise.resolve(),
  });
  return { ...actual, api };
});

// Async storage, as every fresh copy of the modules sees it.
const mockSaved = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockSaved.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockSaved.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      mockSaved.delete(key);
      return Promise.resolve();
    },
    getAllKeys: () => Promise.resolve([...mockSaved.keys()]),
  },
}));

const KEY = 'learnloop.outbox.v1.user-1';
const SIGNED_IN = { status: 'signedIn', userId: 'user-1' } as const;
const SIGNED_OUT = { status: 'signedOut', userId: null } as const;
const CARD_ID = '00000000-0000-4000-8000-000000000001';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SET: FeedSet = {
  ...makeSet(0, [{ ...cardsByType.quiz, id: CARD_ID }]),
  setNumber: 2,
  feedDate: '2026-10-01',
};

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const answered = (status: number) => Promise.resolve(new Response(JSON.stringify({}), { status }));

/** The session of the case running, signed out after it so no retry timer outlives the case. */
let running: typeof import('../../auth/useSession').useSession | undefined;

/** The app's modules, loaded afresh, and the app-state listeners the outbox added. */
function loadApp() {
  const foreground: ((state: AppStateStatus) => void)[] = [];
  let app:
    | {
        outbox: typeof import('../outbox').outbox;
        store: typeof import('../store').useFeedStore;
        session: typeof import('../../auth/useSession');
      }
    | undefined;
  jest.isolateModules(() => {
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      foreground.push(listener);
      return { remove: jest.fn() };
    });
    app = {
      outbox: jest.requireActual<typeof import('../outbox')>('../outbox').outbox,
      store: jest.requireActual<typeof import('../store')>('../store').useFeedStore,
      session: jest.requireActual<typeof import('../../auth/useSession')>('../../auth/useSession'),
    };
  });
  if (app === undefined) throw new Error('the app modules did not load');
  running = app.session.useSession;
  running.setState(SIGNED_IN);
  return { ...app, foreground };
}

/** Starts `SET` in `store` and answers its quiz card. */
function answer(store: ReturnType<typeof loadApp>['store']): void {
  store.getState().startSet(SET);
  store.getState().setAnswer(0, { kind: 'choice', picked: 1 });
}

beforeEach(() => {
  mockSaved.clear();
  mockSend.mockReset();
  mockRefresh.mockClear();
});

afterEach(() => {
  running?.setState(SIGNED_OUT);
  running = undefined;
  jest.restoreAllMocks();
});

describe('the app outbox, with the API', () => {
  it('is installed by the feed session, before any card can be answered', async () => {
    mockSend.mockImplementation(() => answered(200));
    let store: typeof import('../store').useFeedStore | undefined;
    jest.isolateModules(() => {
      jest.requireActual<typeof import('../useFeedSession')>('../useFeedSession');
      store = jest.requireActual<typeof import('../store')>('../store').useFeedStore;
      running =
        jest.requireActual<typeof import('../../auth/useSession')>(
          '../../auth/useSession',
        ).useSession;
      running.setState(SIGNED_IN);
    });
    if (store === undefined) throw new Error('the store did not load');

    answer(store);
    await settle();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('posts an answered card to its attempt path with the API body, and forgets it on a 200', async () => {
    mockSend.mockImplementation(() => answered(200));
    const app = loadApp();

    answer(app.store);
    await settle();

    const request = mockSend.mock.calls[0]?.[0];
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe(`https://api.test/cards/${CARD_ID}/attempt`);
    const body = (await request?.json()) as Record<string, unknown>;
    expect(body).toEqual({
      client_attempt_id: expect.stringMatching(UUID_V4) as unknown,
      response: { choice: 1 },
      duration_ms: expect.any(Number) as unknown,
      feed_date: '2026-10-01',
      set_number: 2,
    });
    expect(app.outbox.pending()).toBe(0);
    expect(mockSaved.get(KEY)).toBe('[]');
  });

  it('keeps an attempt after a 401: the client refreshes the session and does not resend', async () => {
    mockSend.mockImplementation(() => answered(401));
    const app = loadApp();

    answer(app.store);
    await settle();

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(app.outbox.pending()).toBe(1);
  });

  it('tries again when the app returns to the foreground', async () => {
    mockSend.mockImplementationOnce(() => answered(503)).mockImplementation(() => answered(200));
    const app = loadApp();
    answer(app.store);
    await settle();
    expect(app.outbox.pending()).toBe(1);

    app.foreground.forEach((listener) => {
      listener('background');
    });
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);

    app.foreground.forEach((listener) => {
      listener('active');
    });
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(app.outbox.pending()).toBe(0);
  });

  it("keeps the user's attempts under the user's key, and removes them on sign-out", async () => {
    mockSend.mockImplementation(() => answered(503));
    const app = loadApp();
    answer(app.store);
    await settle();
    expect(JSON.parse(mockSaved.get(KEY) ?? '[]')).toHaveLength(1);

    await app.session.signOut();
    await settle();

    expect(app.outbox.pending()).toBe(0);
    expect(mockSaved.has(KEY)).toBe(false);
  });
});
