// src/data/index.ts chooses the app's one card source by `config.dataSource`: the API source for
// `api`, the demo fixture source otherwise. Each case loads the module afresh over a mocked
// configuration; the Supabase client and the session are mocked, and no request is made.
import type { CardSource } from '../index';

jest.mock('../../auth/supabase', () => ({ supabase: { auth: { refreshSession: jest.fn() } } }));
jest.mock('../../auth/useSession', () => ({
  getAccessToken: jest.fn(() => Promise.resolve(null)),
  signOut: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
// The active topic the API source asks for; a test sets it.
const mockActiveTopic = jest.fn<string | null, []>(() => null);
jest.mock('../../feed/useActiveTopic', () => ({ activeTopic: () => mockActiveTopic() }));

/** The `cardSource` that src/data/index.ts exports under `dataSource`. */
function cardSourceFor(dataSource: 'api' | 'fixture'): CardSource {
  let source: CardSource | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../config', () => ({
      config: {
        apiUrl: 'https://api.test',
        supabaseUrl: 'https://supabase.test',
        supabaseAnonKey: 'anon-key-marker',
        dataSource,
      },
      configError: null,
    }));
    source = jest.requireActual<typeof import('../index')>('../index').cardSource;
  });
  if (source === undefined) throw new Error('src/data/index.ts exported no cardSource');
  return source;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cardSource', () => {
  it('is the API source with the api data source: with no active topic it asks nothing', async () => {
    const send = jest.spyOn(globalThis, 'fetch');
    const source = cardSourceFor('api');

    await expect(source.getNextSet()).rejects.toMatchObject({
      name: 'FeedLoadError',
      kind: 'noTopic',
    });
    expect('currentSet' in source).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("asks the API for the learner's active topic, read on each request", async () => {
    const send = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 500 }));
    const source = cardSourceFor('api');
    mockActiveTopic.mockReturnValue('strudel');

    await expect(source.getNextSet()).rejects.toMatchObject({ kind: 'server' });
    mockActiveTopic.mockReturnValue(null);

    const asked = send.mock.calls.map(([request]) => new URL((request as Request).url));
    expect(asked[0]?.pathname).toBe('/feed/today');
    expect(asked[0]?.searchParams.get('topic')).toBe('strudel');
  });

  it('is the demo fixture source with the fixture data source', async () => {
    const source = cardSourceFor('fixture');

    const set = await source.getNextSet();

    expect(set?.setNumber).toBe(1);
    expect('currentSet' in source).toBe(false);
  });
});

/** The `loadSummary` that src/data/index.ts exports under `dataSource`. */
function loadSummaryFor(dataSource: 'api' | 'fixture') {
  let load: typeof import('../index').loadSummary | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../config', () => ({
      config: { apiUrl: 'https://api.test', dataSource },
      configError: null,
    }));
    load = jest.requireActual<typeof import('../index')>('../index').loadSummary;
  });
  return load;
}

describe('loadSummary', () => {
  it('asks the API for a recorded summary with the api data source', async () => {
    const send = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const load = loadSummaryFor('api');

    await expect(
      load?.({ topic: 'strudel', setNumber: 1, feedDate: '2026-10-01' }),
    ).rejects.toMatchObject({ name: 'FeedLoadError', kind: 'offline' });
    expect(send).toHaveBeenCalled();
  });

  it('is null with the fixture data source: there is no API to ask', () => {
    expect(loadSummaryFor('fixture')).toBeNull();
  });
});
