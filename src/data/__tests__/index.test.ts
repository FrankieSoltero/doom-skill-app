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
  it('is the API source with the api data source: no topic yet, so it asks nothing', async () => {
    const send = jest.spyOn(globalThis, 'fetch');
    const source = cardSourceFor('api');

    await expect(source.getNextSet()).rejects.toMatchObject({
      name: 'FeedLoadError',
      kind: 'noTopic',
    });
    expect('currentSet' in source).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('is the demo fixture source with the fixture data source', async () => {
    const source = cardSourceFor('fixture');

    const set = await source.getNextSet();

    expect(set?.setNumber).toBe(1);
    expect('currentSet' in source).toBe(false);
  });
});
