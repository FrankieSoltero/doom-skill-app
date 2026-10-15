import { act, renderHook } from '@testing-library/react-native';

import { createApiClient } from '../client';
import { resetOnline, useOnline } from '../useOnline';

// `useOnline` (offline-topic plan, Global Constraints): offline is read from the API client's
// failure kinds `offline` and `timeout` only, and any success ends it. The network is a mock.

/** The network: answers one request. */
type Network = (request: Request) => Promise<Response>;

/** A client over `network`, with the auth calls and the wait between retries stubbed. */
function clientOver(network: Network) {
  return createApiClient({
    baseUrl: 'https://api.test',
    send: network,
    sleep: () => Promise.resolve(),
    getAccessToken: () => Promise.resolve(null),
    refreshSession: () => Promise.resolve(false),
    signOut: () => Promise.resolve(),
  });
}

/** A network that answers nothing, and fails as `fetch` does once the request is aborted. */
function hangUntilAborted(request: Request): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

const ok = () => Promise.resolve(new Response('{}', { status: 200 }));

/** Sends one POST over `network`, ignoring how it ends. */
async function post(network: Network): Promise<void> {
  await clientOver(network)
    .POST('/topics', { body: { query: 'strudel' } })
    .catch(() => undefined);
}

afterEach(() => {
  jest.useRealTimers();
  // The flag is shared by the whole file: put it back for the next test.
  resetOnline();
});

describe('useOnline', () => {
  it('is true before any failure', () => {
    expect(renderHook(() => useOnline()).result.current).toBe(true);
  });

  it('turns false on a timeout, and true again on a later success', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useOnline());

    const pending = post(hangUntilAborted);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
      await pending;
    });
    expect(result.current).toBe(false);

    await act(() => post(ok));
    expect(result.current).toBe(true);
  });

  it('turns false when the network fails', async () => {
    const { result } = renderHook(() => useOnline());
    await act(() => post(() => Promise.reject(new TypeError('Network request failed'))));
    expect(result.current).toBe(false);
  });

  it.each([
    ['a refusal', 422],
    ['a server fault', 500],
    ['a service that is down', 503],
  ])('stays true after %s, which the server answered', async (_name, status) => {
    const { result } = renderHook(() => useOnline());
    await act(() => post(() => Promise.resolve(new Response('{}', { status }))));
    expect(result.current).toBe(true);
  });
});

describe('resetOnline', () => {
  it('puts a false flag back to true for the next test', async () => {
    const { result } = renderHook(() => useOnline());
    await act(() => post(() => Promise.reject(new TypeError('Network request failed'))));
    expect(result.current).toBe(false);

    act(() => {
      resetOnline();
    });

    expect(result.current).toBe(true);
  });
});
