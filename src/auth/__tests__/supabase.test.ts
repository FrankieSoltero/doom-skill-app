const STORAGE_KEY = 'learnloop.session';

describe('the Supabase client', () => {
  const storage = { marker: 'secure session' };
  const API_CONFIG = {
    apiUrl: 'https://api.learnloop.example',
    supabaseUrl: 'https://project.supabase.example',
    supabaseAnonKey: 'anon-key-marker',
    dataSource: 'api',
  };

  function loadClient(config: object, configError: string | null) {
    const createClient = jest.fn(() => ({ marker: 'client' }));
    let loaded: typeof import('../supabase') | undefined;
    jest.isolateModules(() => {
      jest.doMock('@supabase/supabase-js', () => ({ createClient }));
      jest.doMock('../../config', () => ({ config, configError }));
      jest.doMock('../secureSession', () => ({ secureSession: storage }));
      loaded = jest.requireActual<typeof import('../supabase')>('../supabase');
    });
    return { supabase: loaded?.supabase, createClient };
  }

  it('is one client on the configured project, keeping its session in the secure storage', () => {
    const { supabase, createClient } = loadClient(API_CONFIG, null);

    expect(supabase).toStrictEqual({ marker: 'client' });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(API_CONFIG.supabaseUrl, API_CONFIG.supabaseAnonKey, {
      auth: {
        storage,
        storageKey: STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  });

  it.each([
    ['the fixture source', { ...API_CONFIG, dataSource: 'fixture' }, null],
    ['a configuration problem', API_CONFIG, 'EXPO_PUBLIC_SUPABASE_URL: missing'],
  ])('is null with %s', (_case, config, configError) => {
    const { supabase, createClient } = loadClient(config, configError);

    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
