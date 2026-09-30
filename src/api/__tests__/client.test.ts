import { api, createApiClient } from '../client';
import type { ApiClientDeps } from '../client';
import { ApiError, errorForStatus } from '../errors';

// The API client (src/api/client.ts). The network is a mock: no request leaves the test.

const BASE_URL = 'https://api.test';
const TOKEN = 'access-token-marker';
const FRESH_TOKEN = 'fresh-token-marker';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Network = jest.Mock<Promise<Response>, [Request]>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TOPICS = { topics: [] };

/** A client over a mock network, with the auth calls and the wait between retries mocked. */
function setup() {
  const network: Network = jest.fn((_request: Request) => Promise.resolve(json(200, TOPICS)));
  const deps = {
    baseUrl: BASE_URL,
    send: network,
    sleep: jest.fn(() => Promise.resolve()),
    getAccessToken: jest.fn((): Promise<string | null> => Promise.resolve(TOKEN)),
    refreshSession: jest.fn(() => Promise.resolve(true)),
    signOut: jest.fn(() => Promise.resolve()),
  } satisfies ApiClientDeps;
  return { client: createApiClient(deps), network, ...deps };
}

type Setup = ReturnType<typeof setup>;

/** The request the network received on call `n` (from 0). */
function sent(network: Network, n: number): Request {
  const call = network.mock.calls[n];
  if (call === undefined) {
    throw new Error(`no request ${String(n)}`);
  }
  return call[0];
}

function getTopics({ client }: Setup) {
  return client.GET('/topics', { params: { query: { q: 'strudel' } } });
}

function postTopic({ client }: Setup) {
  return client.POST('/topics', { body: { query: 'strudel' } });
}

/** A network that answers nothing, and fails as `fetch` does once the request is aborted. */
function hangUntilAborted(request: Request): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

/** The rejection of `promise`, which must be an `ApiError`. */
async function apiErrorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ApiError)) {
    throw new Error('expected an ApiError');
  }
  return error;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('every request', () => {
  it('carries the access token and a new UUID v4 request id', async () => {
    const setupResult = setup();

    const { data } = await getTopics(setupResult);
    await getTopics(setupResult);

    expect(data).toStrictEqual(TOPICS);
    const [first, second] = [sent(setupResult.network, 0), sent(setupResult.network, 1)];
    expect(first.url).toBe(`${BASE_URL}/topics?q=strudel`);
    expect(first.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(first.headers.get('X-Request-ID')).toMatch(UUID_V4);
    expect(second.headers.get('X-Request-ID')).toMatch(UUID_V4);
    expect(second.headers.get('X-Request-ID')).not.toBe(first.headers.get('X-Request-ID'));
  });

  it('carries no Authorization header without a session', async () => {
    const setupResult = setup();
    setupResult.getAccessToken.mockResolvedValue(null);

    await getTopics(setupResult);

    expect(sent(setupResult.network, 0).headers.has('Authorization')).toBe(false);
  });

  it('makes the request id from getRandomValues where randomUUID is missing', async () => {
    // React Native's crypto, from react-native-get-random-values: getRandomValues only.
    const getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) array.fill(0xff);
      return array;
    };
    jest.replaceProperty(globalThis, 'crypto', { getRandomValues } as unknown as Crypto);
    const setupResult = setup();

    await getTopics(setupResult);

    expect(sent(setupResult.network, 0).headers.get('X-Request-ID')).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
  });

  it('gives up after 15 seconds with a timeout, and does not retry', async () => {
    jest.useFakeTimers();
    const setupResult = setup();
    setupResult.network.mockImplementation(hangUntilAborted);

    const result = apiErrorOf(getTopics(setupResult));
    await jest.advanceTimersByTimeAsync(14_999);
    expect(setupResult.network.mock.calls[0]?.[0].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    const error = await result;
    expect(error).toMatchObject({ kind: 'timeout', status: 0 });
    expect(setupResult.network).toHaveBeenCalledTimes(1);
  });
});

describe('a request the caller cancels', () => {
  it("rejects with the caller's abort, not an ApiError, and is not retried", async () => {
    const setupResult = setup();
    setupResult.network.mockImplementation(hangUntilAborted);
    const caller = new AbortController();

    const pending = setupResult.client
      .GET('/topics', { params: { query: { q: 'strudel' } }, signal: caller.signal })
      .catch((reason: unknown) => reason);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setupResult.network).toHaveBeenCalledTimes(1);
    caller.abort();

    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(setupResult.network).toHaveBeenCalledTimes(1);
    expect(setupResult.sleep).not.toHaveBeenCalled();
  });
});

describe('retries of a GET', () => {
  it('retries a network error after 1 s and 3 s, then reports offline', async () => {
    const setupResult = setup();
    setupResult.network.mockRejectedValue(new TypeError('Network request failed'));

    const error = await apiErrorOf(getTopics(setupResult));

    expect(error).toMatchObject({ kind: 'offline', status: 0 });
    expect(setupResult.network).toHaveBeenCalledTimes(3);
    expect(setupResult.sleep.mock.calls).toStrictEqual([[1000], [3000]]);
  });

  it('retries a 503 at most twice, then reports unavailable', async () => {
    const setupResult = setup();
    setupResult.network.mockImplementation(() => Promise.resolve(json(503, { detail: 'down' })));

    const error = await apiErrorOf(getTopics(setupResult));

    expect(error).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(setupResult.network).toHaveBeenCalledTimes(3);
    expect(setupResult.sleep.mock.calls).toStrictEqual([[1000], [3000]]);
  });

  it('gives the answer of a retry that works', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValueOnce(json(503, { detail: 'down' }));

    const { data } = await getTopics(setupResult);

    expect(data).toStrictEqual(TOPICS);
    expect(setupResult.network).toHaveBeenCalledTimes(2);
    expect(setupResult.sleep).toHaveBeenCalledTimes(1);
  });
});

describe('a POST', () => {
  it('sends its JSON body with the headers', async () => {
    const setupResult = setup();

    await postTopic(setupResult);

    const request = sent(setupResult.network, 0);
    expect(request.method).toBe('POST');
    expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(request.headers.get('Content-Type')).toBe('application/json');
    // The body is parsed in the fetch realm, so its prototype differs: `toEqual`, not strict.
    expect(await request.json()).toEqual({ query: 'strudel' });
  });

  it('is never retried after a 503', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValue(json(503, { detail: 'down' }));

    const error = await apiErrorOf(postTopic(setupResult));

    expect(error).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(setupResult.network).toHaveBeenCalledTimes(1);
    expect(setupResult.sleep).not.toHaveBeenCalled();
  });

  it('is never retried after a network error', async () => {
    const setupResult = setup();
    setupResult.network.mockRejectedValue(new TypeError('Network request failed'));

    expect(await apiErrorOf(postTopic(setupResult))).toMatchObject({ kind: 'offline' });
    expect(setupResult.network).toHaveBeenCalledTimes(1);
  });

  it('refreshes the session after a 401 but is not sent again', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValue(json(401, { detail: 'bad token' }));

    const error = await apiErrorOf(postTopic(setupResult));

    expect(error).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(setupResult.refreshSession).toHaveBeenCalledTimes(1);
    expect(setupResult.network).toHaveBeenCalledTimes(1);
    expect(setupResult.signOut).not.toHaveBeenCalled();
  });
});

describe('a 401', () => {
  it('refreshes the session once and retries once with the new token', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValueOnce(json(401, { detail: 'expired' }));
    setupResult.getAccessToken.mockResolvedValueOnce(TOKEN).mockResolvedValue(FRESH_TOKEN);

    const { data } = await getTopics(setupResult);

    expect(data).toStrictEqual(TOPICS);
    expect(setupResult.refreshSession).toHaveBeenCalledTimes(1);
    expect(sent(setupResult.network, 1).headers.get('Authorization')).toBe(`Bearer ${FRESH_TOKEN}`);
    expect(setupResult.signOut).not.toHaveBeenCalled();
  });

  it('signs out when the retry gets a 401 again', async () => {
    const setupResult = setup();
    setupResult.network.mockImplementation(() => Promise.resolve(json(401, { detail: 'no' })));

    const error = await apiErrorOf(getTopics(setupResult));

    expect(error).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(setupResult.refreshSession).toHaveBeenCalledTimes(1);
    expect(setupResult.network).toHaveBeenCalledTimes(2);
    expect(setupResult.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the session cannot be refreshed', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValue(json(401, { detail: 'expired' }));
    setupResult.refreshSession.mockResolvedValue(false);

    expect(await apiErrorOf(getTopics(setupResult))).toMatchObject({ kind: 'unauthorized' });
    expect(setupResult.network).toHaveBeenCalledTimes(1);
    expect(setupResult.signOut).not.toHaveBeenCalled();
  });
});

describe('error values', () => {
  it('hold the kind and the status only: never the token, the body or the query', async () => {
    const setupResult = setup();
    setupResult.network.mockResolvedValue(json(404, { detail: 'secret-body' }));

    const error = await apiErrorOf(
      setupResult.client.GET('/topics', { params: { query: { q: 'secret-query' } } }),
    );

    expect(error).toMatchObject({ name: 'ApiError', kind: 'notFound', status: 404 });
    const everything = [error.message, String(error), JSON.stringify(error), error.stack ?? ''];
    for (const text of everything) {
      expect(text).not.toMatch(/secret-body|secret-query|token-marker|api\.test/);
    }
    expect(Object.keys(error).sort()).toStrictEqual(['kind', 'name', 'status']);
  });

  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'notFound'],
    [409, 'conflict'],
    [422, 'invalid'],
    [429, 'rateLimited'],
    [500, 'server'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
  ] as const)('name a %i %s', (status, kind) => {
    expect(errorForStatus(status)).toMatchObject({ kind, status });
  });
});

describe('api', () => {
  it('is null with the fixture source, which calls no API', () => {
    expect(api).toBeNull();
  });
});
