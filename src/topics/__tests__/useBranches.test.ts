// A catalog subject's branches (src/topics/useBranches.ts): `GET /catalog/{key}/branches` through
// the server-state cache, as Explore rows. Over the real API client and a fake network; nothing
// leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { BRANCHES_STALE_MS, useBranches } from '../useBranches';

const MATHS = 'wikidata:Q395';
const ROUTE = 'GET /catalog/wikidata%3AQ395/branches';
const MINUTE = 60_000;

const branch = (key: string, label: string, built_slug: string | null, branches: number) => ({
  key,
  label,
  group: 'quantitative',
  kind: 'academic discipline',
  rank: 500,
  built_slug,
  branches,
});
const ALGEBRA = branch('wikidata:Q3968', 'Algebra', null, 4);
const GEOMETRY = branch('wikidata:Q8087', 'Geometry', 'geometry', 0);
const pending = new Promise<Response>(() => undefined);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Lets the fake clock run `ms`, settling every answer due by then. */
async function wait(ms: number) {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

/** `useBranches(key)` over a fake network that answers `routes`, in a fresh cache. */
function renderBranches(routes: Record<string, Answer[]>, key: string | null) {
  const requests = serveApi(routes);
  const cache = queryWrapper();
  return { ...renderHook(() => useBranches(key), { wrapper: cache.wrapper }), ...cache, requests };
}

describe('useBranches', () => {
  it('asks for the subject’s branches and gives them as Explore rows, in the server’s order', async () => {
    const hook = renderBranches({ [ROUTE]: [json(200, [ALGEBRA, GEOMETRY])] }, MATHS);
    expect(hook.result.current).toStrictEqual({ status: 'loading', rows: [] });
    await wait(0);

    expect(hook.requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([ROUTE]);
    expect(hook.result.current).toStrictEqual({
      status: 'ready',
      rows: [
        {
          key: 'wikidata:Q3968',
          label: 'Algebra',
          group: 'quantitative',
          kind: 'academic discipline',
          builtSlug: null,
          source: 'catalog',
          branches: 4,
        },
        {
          key: 'wikidata:Q8087',
          label: 'Geometry',
          group: 'quantitative',
          kind: 'academic discipline',
          builtSlug: 'geometry',
          source: 'catalog',
          branches: 0,
        },
      ],
    });
    expect(hook.client.getQueryData(['catalog', 'branches', MATHS])).toHaveLength(2);
  });

  it('is loading while the request waits', async () => {
    const hook = renderBranches({ [ROUTE]: [pending] }, MATHS);
    await wait(MINUTE);

    expect(hook.result.current).toStrictEqual({ status: 'loading', rows: [] });
  });

  it('is an error with no rows when the request fails', async () => {
    const hook = renderBranches({ [ROUTE]: [json(500, { detail: 'boom' })] }, MATHS);
    await wait(0);

    expect(hook.result.current).toStrictEqual({ status: 'error', rows: [] });
  });

  it('is idle and asks nothing without a key', async () => {
    const hook = renderBranches({ [ROUTE]: [json(200, [ALGEBRA])] }, null);
    await wait(MINUTE);

    expect(hook.result.current).toStrictEqual({ status: 'idle', rows: [] });
    expect(hook.requests).toHaveLength(0);
  });

  it('asks once across two mounts within an hour', async () => {
    const first = renderBranches({ [ROUTE]: [json(200, [ALGEBRA])] }, MATHS);
    await wait(0);
    first.unmount();
    await wait(BRANCHES_STALE_MS - MINUTE);
    const second = renderHook(() => useBranches(MATHS), { wrapper: first.wrapper });
    await wait(0);

    expect(second.result.current.rows.map((r) => r.label)).toStrictEqual(['Algebra']);
    expect(first.requests).toHaveLength(1);
  });

  it('asks again on a mount after an hour', async () => {
    const first = renderBranches({ [ROUTE]: [json(200, [ALGEBRA])] }, MATHS);
    await wait(0);
    first.unmount();
    await wait(BRANCHES_STALE_MS + MINUTE);
    const second = renderHook(() => useBranches(MATHS), { wrapper: first.wrapper });
    await wait(0);
    second.unmount();

    expect(first.requests).toHaveLength(2);
  });

  it('keeps the branches in the cache an hour after the sheet closes, then drops them', async () => {
    const first = renderBranches({ [ROUTE]: [json(200, [ALGEBRA])] }, MATHS);
    await wait(0);
    first.unmount();
    await wait(BRANCHES_STALE_MS - MINUTE);
    expect(first.client.getQueryData(['catalog', 'branches', MATHS])).toBeDefined();
    await wait(2 * MINUTE);

    expect(first.client.getQueryData(['catalog', 'branches', MATHS])).toBeUndefined();
  });
});
