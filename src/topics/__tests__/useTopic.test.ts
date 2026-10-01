// One topic's detail (src/topics/useTopic.ts), over the real API client and a fake network.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useTopic } from '../useTopic';

const DETAIL = {
  slug: 'strudel',
  title: 'Strudel',
  description: null,
  status: 'ready',
  end_state: 'Write a 16-bar layered piece.',
  milestones: [{ id: 'm1', position: 1, title: 'First sounds' }],
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderTopic(slug: string) {
  const { wrapper } = queryWrapper();
  const rendered = renderHook(() => useTopic(slug), { wrapper });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

describe('useTopic', () => {
  it('reads the topic by its slug', async () => {
    const requests = serveApi({ 'GET /topics/strudel': [json(200, DETAIL)] });
    const { result } = await renderTopic('strudel');

    expect(requests.map((r) => r.path)).toStrictEqual(['/topics/strudel']);
    expect(result.current).toMatchObject({ status: 'ready', topic: DETAIL });
  });

  it('is loading until the answer comes', () => {
    serveApi({ 'GET /topics/strudel': [json(200, DETAIL)] });
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useTopic('strudel'), { wrapper });

    expect(result.current.status).toBe('loading');
  });

  it('reports a failure with its ApiError, and asks again on retry', async () => {
    const requests = serveApi({ 'GET /topics/strudel': [json(404, {}), json(200, DETAIL)] });
    const { result } = await renderTopic('strudel');
    expect(result.current.status).toBe('error');
    expect(result.current.error?.kind).toBe('notFound');

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(requests).toHaveLength(2);
    expect(result.current.status).toBe('ready');
  });
});
