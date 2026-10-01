// The topic search and topic request (src/topics/useTopics.ts), over the real API client and a
// fake network. Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useCreateTopic, useTopics } from '../useTopics';

const STRUDEL = { slug: 'strudel', title: 'Strudel', description: null, status: 'ready' };

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

function renderSearch(initial: string) {
  const { wrapper } = queryWrapper();
  return renderHook(({ query }: { query: string }) => useTopics(query), {
    initialProps: { query: initial },
    wrapper,
  });
}

describe('useTopics', () => {
  it('is idle with no request for an empty or blank query', async () => {
    const requests = serveApi({ 'GET /topics': [json(200, { topics: [] })] });
    const { result } = renderSearch('   ');
    await advance(1000);

    expect(result.current).toMatchObject({ status: 'idle', topics: [] });
    expect(requests).toHaveLength(0);
  });

  it('waits 300 ms after the last change, then asks once for the trimmed query', async () => {
    const requests = serveApi({ 'GET /topics': [json(200, { topics: [STRUDEL] })] });
    const { result, rerender } = renderSearch('');
    rerender({ query: 'st' });
    await advance(200);
    rerender({ query: ' stru ' });
    await advance(299);

    expect(result.current.status).toBe('loading');
    expect(requests).toHaveLength(0);
    await advance(1);

    expect(requests.map((r) => r.query)).toStrictEqual(['?q=stru']);
    await advance(0);
    expect(result.current).toMatchObject({ status: 'ready', topics: [STRUDEL] });
  });

  it('cuts the query to 80 characters', async () => {
    const requests = serveApi({ 'GET /topics': [json(200, { topics: [] })] });
    renderSearch(`${'a'.repeat(79)}bcd`);
    await advance(300);

    expect(requests[0]?.query).toBe(`?q=${'a'.repeat(79)}b`);
  });

  it('reports a failed search with its ApiError', async () => {
    serveApi({ 'GET /topics': [json(500, { detail: 'boom' })] });
    const { result } = renderSearch('strudel');
    await advance(300);

    expect(result.current.status).toBe('error');
    expect(result.current.topics).toStrictEqual([]);
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(500);
  });

  it('asks again on retry', async () => {
    const requests = serveApi({ 'GET /topics': [json(500, {}), json(200, { topics: [STRUDEL] })] });
    const { result } = renderSearch('strudel');
    await advance(300);
    expect(result.current.status).toBe('error');

    act(() => {
      result.current.retry();
    });
    await advance(0);

    expect(requests).toHaveLength(2);
    expect(result.current).toMatchObject({ status: 'ready', topics: [STRUDEL] });
  });

  it('reports an error when the app has no API client', async () => {
    const { result } = renderSearch('strudel');
    await advance(300);

    expect(result.current.status).toBe('error');
    expect(result.current.error?.kind).toBe('server');
  });
});

function renderCreate() {
  const { wrapper } = queryWrapper();
  return renderHook(() => useCreateTopic(), { wrapper });
}

describe('useCreateTopic', () => {
  it.each([
    { status: 202, jobId: 'job-1' },
    { status: 200, jobId: null },
  ])('posts the query and gives the slug and job id of a $status', async ({ status, jobId }) => {
    const topic = { ...STRUDEL, status: 'pending' };
    const requests = serveApi({ 'POST /topics': [json(status, { topic, job_id: jobId })] });
    const { result } = renderCreate();

    expect(result.current.status).toBe('idle');
    let created: unknown = null;
    await act(async () => {
      created = await result.current.create('Strudel');
    });
    await advance(0);

    expect(created).toStrictEqual({ slug: 'strudel', title: 'Strudel', jobId });
    expect(requests).toStrictEqual([
      { method: 'POST', path: '/topics', query: '', body: { query: 'Strudel' } },
    ]);
    expect(result.current.status).toBe('ready');
  });

  it.each([
    { status: 422, kind: 'invalid' },
    { status: 429, kind: 'rateLimited' },
  ])('rejects a $status and reports its ApiError', async ({ status, kind }) => {
    serveApi({ 'POST /topics': [json(status, { detail: 'no' })] });
    const { result } = renderCreate();

    let thrown: unknown = null;
    await act(async () => {
      await result.current.create('Cobol').catch((error: unknown) => {
        thrown = error;
      });
    });
    await advance(0);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(result.current.status).toBe('error');
    expect(result.current.error?.kind).toBe(kind);
  });
});
