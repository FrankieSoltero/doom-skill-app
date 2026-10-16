// The topic request (src/topics/useTopics.ts), over the real API client and a fake network.
// Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useCreateTopic } from '../useTopics';

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

function renderCreate() {
  const { wrapper } = queryWrapper();
  return renderHook(() => useCreateTopic(), { wrapper });
}

describe('useCreateTopic', () => {
  it.each([
    { status: 202, jobId: 'job-1' },
    { status: 200, jobId: null },
  ])(
    'posts the query and gives the slug, status and job id of a $status',
    async ({ status, jobId }) => {
      const topic = { ...STRUDEL, status: 'pending' };
      const requests = serveApi({ 'POST /topics': [json(status, { topic, job_id: jobId })] });
      const { result } = renderCreate();

      expect(result.current.status).toBe('idle');
      let created: unknown = null;
      await act(async () => {
        created = await result.current.create('Strudel');
      });
      await advance(0);

      expect(created).toStrictEqual({
        slug: 'strudel',
        title: 'Strudel',
        status: 'pending',
        jobId,
      });
      expect(requests).toStrictEqual([
        { method: 'POST', path: '/topics', query: '', body: { query: 'Strudel' } },
      ]);
      expect(result.current.status).toBe('ready');
    },
  );

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
