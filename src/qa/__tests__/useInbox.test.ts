// The learner's questions inbox (src/qa/useInbox.ts) and the app state it polls on
// (src/qa/useAppActive.ts), over the real API client, a fake network and Jest's fake clock.
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { appBecomes, appIsAlready, restoreAppState } from '../../cards/testing/appState';
import { useAppActive } from '../useAppActive';
import { INBOX_KEY, INBOX_POLL_MS, useInbox } from '../useInbox';

const EMPTY = { to_answer: [], answered: [], badge: 0 };
const THREE_NEW = { ...EMPTY, badge: 3 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(AppState).addEventListener.mockClear();
  appIsAlready('active');
});

afterEach(() => {
  restoreAppState();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderInbox() {
  const cache = queryWrapper();
  const rendered = renderHook(() => useInbox(), { wrapper: cache.wrapper });
  await advance(0);
  return { ...rendered, client: cache.client };
}

/** How many inbox requests the fake network was sent. */
const inboxReads = (requests: { path: string }[]) =>
  requests.filter((r) => r.path === '/questions/inbox').length;

describe('useAppActive', () => {
  it('is true while the app is active and follows its change events', () => {
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(true);

    appBecomes('background');
    expect(result.current).toBe(false);

    appBecomes('active');
    expect(result.current).toBe(true);
  });

  it('starts false when the app is already in the background', () => {
    appIsAlready('background');
    const { result } = renderHook(() => useAppActive());

    expect(result.current).toBe(false);
  });

  it('reads inactive as not active', () => {
    const { result } = renderHook(() => useAppActive());

    appBecomes('inactive');

    expect(result.current).toBe(false);
  });
});

describe('useInbox', () => {
  it('polls every 60 s, under the query key inbox', () => {
    expect(INBOX_POLL_MS).toBe(60_000);
    expect(INBOX_KEY).toStrictEqual(['inbox']);
  });

  it('reads the inbox and its badge', async () => {
    const requests = serveApi({ 'GET /questions/inbox': [json(200, THREE_NEW)] });
    const { result, client } = await renderInbox();

    expect(inboxReads(requests)).toBe(1);
    expect(result.current).toMatchObject({
      status: 'ready',
      inbox: { toAnswer: [], answered: [], badge: 3 },
      badge: 3,
    });
    expect(client.getQueryData(INBOX_KEY)).toStrictEqual(result.current.inbox);
  });

  it('is loading with a badge of 0 until the answer comes', async () => {
    serveApi({ 'GET /questions/inbox': [json(200, THREE_NEW)] });
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useInbox(), { wrapper });

    expect(result.current).toMatchObject({ status: 'loading', badge: 0 });
    expect(result.current.inbox).toBeUndefined();
    await advance(0);
    expect(result.current.badge).toBe(3);
  });

  it('reports a failure with its ApiError and a badge of 0, and asks again on retry', async () => {
    const requests = serveApi({
      'GET /questions/inbox': [json(404, {}), json(200, THREE_NEW)],
    });
    const { result } = await renderInbox();
    expect(result.current).toMatchObject({ status: 'error', badge: 0 });
    expect(result.current.error?.kind).toBe('notFound');

    act(() => {
      result.current.retry();
    });
    await advance(0);

    expect(inboxReads(requests)).toBe(2);
    expect(result.current).toMatchObject({ status: 'ready', badge: 3 });
  });

  it('asks again every INBOX_POLL_MS while the app is active', async () => {
    const requests = serveApi({
      'GET /questions/inbox': [json(200, EMPTY), json(200, THREE_NEW)],
    });
    const { result } = await renderInbox();
    expect(result.current.badge).toBe(0);

    await advance(INBOX_POLL_MS - 1);
    expect(inboxReads(requests)).toBe(1);
    await advance(1);

    expect(inboxReads(requests)).toBe(2);
    expect(result.current.badge).toBe(3);
  });

  it('does not ask while the app is in the background', async () => {
    const requests = serveApi({ 'GET /questions/inbox': [json(200, EMPTY)] });
    await renderInbox();

    appBecomes('background');
    await advance(INBOX_POLL_MS * 3);

    expect(inboxReads(requests)).toBe(1);
  });

  it('asks at once when the app returns to the foreground, then polls again', async () => {
    const requests = serveApi({ 'GET /questions/inbox': [json(200, EMPTY)] });
    await renderInbox();
    appBecomes('background');
    await advance(INBOX_POLL_MS * 2);

    appBecomes('active');
    await advance(0);
    expect(inboxReads(requests)).toBe(2);

    await advance(INBOX_POLL_MS);
    expect(inboxReads(requests)).toBe(3);
  });
});
