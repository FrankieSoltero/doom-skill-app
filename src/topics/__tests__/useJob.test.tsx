// A topic's ingestion job, polled (src/topics/useJob.ts), over the real API client and a fake
// network. Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { setFocused, useFocusEffect as mockUseFocusEffect } from '../testing/focus';
import { useJob } from '../useJob';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const JOB_ID = '6f1c2a54-0000-4000-8000-000000000001';

const job = (status: string, reason: string | null = null) =>
  json(200, { id: JOB_ID, kind: 'ingest_topic', progress: {}, reason, status });

beforeEach(() => {
  jest.useFakeTimers();
  setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Serves the job's answers, in order. */
const serveJob = (...answers: Response[]) => serveApi({ [`GET /jobs/${JOB_ID}`]: answers });

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

function renderJob(jobId: string | null) {
  const { wrapper } = queryWrapper();
  return renderHook(() => useJob(jobId), { wrapper });
}

describe('useJob', () => {
  it('asks nothing and reports no status without a job', async () => {
    const requests = serveJob(job('queued'));
    const { result } = renderJob(null);
    await advance(10_000);

    expect(result.current).toStrictEqual({ status: null });
    expect(requests).toHaveLength(0);
  });

  it('asks every 3 s while the job is queued or running, and stops once it is done', async () => {
    const requests = serveJob(job('queued'), job('running'), job('done'));
    const { result } = renderJob(JOB_ID);
    await advance(0);
    expect(result.current.status).toBe('queued');

    await advance(3000);
    expect(result.current.status).toBe('running');
    await advance(3000);
    expect(result.current).toStrictEqual({ status: 'done' });
    await advance(30_000);

    expect(requests).toHaveLength(3);
  });

  it('stops on a failed job and gives its reason', async () => {
    const requests = serveJob(job('failed', 'no sources'));
    const { result } = renderJob(JOB_ID);
    await advance(30_000);

    expect(result.current).toStrictEqual({ status: 'failed', reason: 'no sources' });
    expect(requests).toHaveLength(1);
  });

  it('keeps asking after a failed request', async () => {
    const requests = serveJob(json(500, {}), job('running'));
    const { result } = renderJob(JOB_ID);
    await advance(0);
    expect(result.current.status).toBeNull();

    await advance(3000);
    expect(result.current.status).toBe('running');
    expect(requests).toHaveLength(2);
  });

  it('gives up after 10 minutes as a timeout', async () => {
    const requests = serveJob(job('running'));
    const { result } = renderJob(JOB_ID);
    await advance(10 * 60_000 - 1);
    expect(result.current.status).toBe('running');

    await advance(1);
    expect(result.current).toStrictEqual({ status: 'timeout' });
    const asked = requests.length;
    await advance(60_000);
    expect(requests).toHaveLength(asked);
  });

  it('stops while the screen is out of focus and asks again when it returns', async () => {
    const requests = serveJob(job('running'));
    renderJob(JOB_ID);
    await advance(0);
    act(() => {
      setFocused(false);
    });
    await advance(30_000);
    expect(requests).toHaveLength(1);

    act(() => {
      setFocused(true);
    });
    await advance(0);
    expect(requests.length).toBeGreaterThan(1);
  });
});
