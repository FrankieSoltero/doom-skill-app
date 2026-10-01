// A topic's skill tree (src/topics/useTree.ts), over the real API client and a fake network.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { setFocused, useFocusEffect as mockUseFocusEffect } from '../testing/focus';
import { useTree } from '../useTree';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseFocusEffect(effect);
  },
}));

const TREE = {
  topic: { slug: 'strudel', title: 'Strudel', description: null, status: 'ready', end_state: 'x' },
  milestones: [{ id: 'm1', position: 1, title: 'First sounds' }],
  nodes: [],
  edges: [],
};

beforeEach(() => {
  jest.useFakeTimers();
  setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function renderTree(slug: string | null) {
  const { wrapper } = queryWrapper();
  const rendered = renderHook(() => useTree(slug), { wrapper });
  await advance(0);
  return rendered;
}

describe('useTree', () => {
  it('is idle and asks nothing without a topic', async () => {
    const requests = serveApi({ 'GET /topics/strudel/tree': [json(200, TREE)] });
    const { result } = await renderTree(null);

    expect(result.current.status).toBe('idle');
    expect(requests).toHaveLength(0);
  });

  it("reads the topic's tree", async () => {
    const requests = serveApi({ 'GET /topics/strudel/tree': [json(200, TREE)] });
    const { result } = await renderTree('strudel');

    expect(requests.map((r) => r.path)).toStrictEqual(['/topics/strudel/tree']);
    expect(result.current).toMatchObject({ status: 'ready', tree: TREE });
  });

  it('reports a tree not built yet (a 409) with its ApiError, and asks again on retry', async () => {
    const requests = serveApi({
      'GET /topics/strudel/tree': [json(409, { detail: 'not ready' }), json(200, TREE)],
    });
    const { result } = await renderTree('strudel');
    expect(result.current.status).toBe('error');
    expect(result.current.error?.kind).toBe('conflict');

    act(() => {
      result.current.retry();
    });
    await advance(0);

    expect(requests).toHaveLength(2);
    expect(result.current.status).toBe('ready');
  });

  it('reads the tree again when the screen returns to focus, so mastery is current', async () => {
    const requests = serveApi({ 'GET /topics/strudel/tree': [json(200, TREE)] });
    await renderTree('strudel');
    act(() => {
      setFocused(false);
    });
    act(() => {
      setFocused(true);
    });
    await advance(0);

    expect(requests).toHaveLength(2);
  });
});
