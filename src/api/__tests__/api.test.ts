import type { supabase } from '../../auth/supabase';
import { signOut } from '../../auth/useSession';
import { logWarning } from '../../log';
import { api } from '../client';
import { ApiError } from '../errors';

// The `api` export with the API source: the client wired to the configured base URL, `fetch`,
// the real wait between retries and the Supabase session. The policy itself is in client.test.ts.
// `fetch` is a mock: no request leaves the test.

jest.mock('../../config', () => ({
  config: { apiUrl: 'https://api.test', supabaseUrl: '', supabaseAnonKey: '', dataSource: 'api' },
  configError: null,
}));
jest.mock('../../auth/supabase', () => ({ supabase: { auth: { refreshSession: jest.fn() } } }));
jest.mock('../../auth/useSession', () => ({
  getAccessToken: jest.fn(() => Promise.resolve('token-marker')),
  signOut: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../log');

type Refresh = NonNullable<typeof supabase>['auth']['refreshSession'];

type SupabaseMock = { supabase: { auth: { refreshSession: jest.MockedFunction<Refresh> } } };

const { refreshSession } = jest.requireMock<SupabaseMock>('../../auth/supabase').supabase.auth;
const PROFILE = { display_name: null };

function status(code: number): Response {
  return new Response(JSON.stringify(code === 200 ? PROFILE : { detail: 'x' }), { status: code });
}

function network() {
  return jest.spyOn(globalThis, 'fetch');
}

function client() {
  if (api === null) {
    throw new Error('api is null with the API source');
  }
  return api;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('api with the API source', () => {
  it('sends to the configured base URL through fetch, with the session token', async () => {
    const sent = network().mockResolvedValue(status(200));

    const { data } = await client().GET('/me');

    expect(data).toStrictEqual(PROFILE);
    const request = sent.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('fetch got no Request');
    expect(request.url).toBe('https://api.test/me');
    expect(request.headers.get('Authorization')).toBe('Bearer token-marker');
  });

  it('waits 1 s before retrying a 503', async () => {
    jest.useFakeTimers();
    const sent = network().mockResolvedValueOnce(status(503)).mockResolvedValue(status(200));

    const pending = client().GET('/me');
    await jest.advanceTimersByTimeAsync(999);
    expect(sent).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    expect((await pending).data).toStrictEqual(PROFILE);
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it('refreshes the session through Supabase after a 401, then retries', async () => {
    network().mockResolvedValueOnce(status(401)).mockResolvedValue(status(200));
    refreshSession.mockResolvedValue({
      data: { user: null, session: { access_token: 'fresh' } },
      error: null,
    } as unknown as Awaited<ReturnType<Refresh>>);

    expect((await client().GET('/me')).data).toStrictEqual(PROFILE);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'refuses',
      'Error',
      () =>
        refreshSession.mockResolvedValue({
          data: { user: null, session: null },
          error: new Error('refused'),
        } as unknown as Awaited<ReturnType<Refresh>>),
    ],
    ['throws', 'TypeError', () => refreshSession.mockRejectedValue(new TypeError('offline'))],
  ] as const)(
    'does not retry when the refresh %s, and logs only its kind',
    async (_, kind, failRefresh) => {
      const sent = network().mockResolvedValue(status(401));
      failRefresh();

      const error: unknown = await client()
        .GET('/me')
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ kind: 'unauthorized', status: 401 });
      expect(sent).toHaveBeenCalledTimes(1);
      expect(signOut).not.toHaveBeenCalled();
      expect(logWarning).toHaveBeenCalledWith('session_refresh_failed', { kind });
    },
  );
});
