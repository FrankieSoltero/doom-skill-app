import {
  config as loadedConfig,
  parseConfig,
  SOURCE_REPOSITORY,
  sourceUrl,
  type RawConfig,
} from '../config';

const API = 'https://api.doomskill.example';
const SUPABASE = 'https://project.supabase.example';
const ANON_KEY = 'anon-key-marker';
const VALID: RawConfig = {
  apiUrl: API,
  supabaseUrl: SUPABASE,
  supabaseAnonKey: ANON_KEY,
  dataSource: 'api',
};
const EMPTY = { apiUrl: '', supabaseUrl: '', supabaseAnonKey: '' };
const RELEASE = false;
const DEV = true;

/** The error `parseConfig` gives for `raw`, which the test expects not to quote any value. */
function errorFor(raw: RawConfig, dev = RELEASE): string | null {
  const { error } = parseConfig(raw, dev);
  for (const value of Object.values(raw)) {
    if (value !== undefined && value !== '' && value !== 'api') {
      expect(error ?? '').not.toContain(value);
    }
  }
  return error;
}

describe('parseConfig, the fixture source', () => {
  it.each([undefined, '', 'fixture'])('runs on the demo cards when the source is %p', (source) => {
    expect(parseConfig({ dataSource: source }, RELEASE)).toStrictEqual({
      config: { ...EMPTY, dataSource: 'fixture' },
      error: null,
    });
  });

  it('keeps the three values that pass the check, and drops one that does not', () => {
    const raw = { ...VALID, dataSource: 'fixture', apiUrl: 'http://127.0.0.1:8000' };

    expect(parseConfig(raw, RELEASE)).toStrictEqual({
      config: {
        apiUrl: '',
        supabaseUrl: SUPABASE,
        supabaseAnonKey: ANON_KEY,
        dataSource: 'fixture',
      },
      error: null,
    });
  });

  it('refuses a source it does not know, naming the variable only', () => {
    expect(errorFor({ ...VALID, dataSource: 'remote-server' })).toBe(
      'EXPO_PUBLIC_DATA_SOURCE: not api or fixture',
    );
  });
});

describe('parseConfig, the api source', () => {
  it('takes three https values, without a trailing slash', () => {
    const raw = { ...VALID, apiUrl: `${API}/`, supabaseUrl: ` ${SUPABASE} ` };

    expect(parseConfig(raw, RELEASE)).toStrictEqual({ config: VALID, error: null });
  });

  it.each([
    ['apiUrl', 'EXPO_PUBLIC_API_URL'],
    ['supabaseUrl', 'EXPO_PUBLIC_SUPABASE_URL'],
    ['supabaseAnonKey', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  ])('refuses a missing %s, naming %s', (field, variable) => {
    expect(errorFor({ ...VALID, [field]: undefined })).toBe(`${variable}: missing`);
    expect(errorFor({ ...VALID, [field]: '  ' })).toBe(`${variable}: missing`);
  });

  it.each([
    'not a url',
    'api.doomskill.example',
    'ftp://api.doomskill.example',
    'javascript:alert(1)',
    'https://user:secret-marker@api.doomskill.example',
    'https://api.doomskill.example/?token=secret-marker',
    'https://api.doomskill.example/#secret-marker',
  ])('refuses %p as a URL, without quoting it', (url) => {
    expect(errorFor({ ...VALID, apiUrl: url })).toBe('EXPO_PUBLIC_API_URL: not an allowed URL');
    expect(errorFor({ ...VALID, supabaseUrl: url })).toBe(
      'EXPO_PUBLIC_SUPABASE_URL: not an allowed URL',
    );
  });

  it('refuses an anon key with whitespace inside', () => {
    expect(errorFor({ ...VALID, supabaseAnonKey: 'anon key-marker' })).toBe(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY: not a key',
    );
  });
});

describe('parseConfig, http', () => {
  it.each([
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://[::1]:8000',
    'http://10.0.2.2:8000',
    'http://192.168.1.20:8000',
    'http://172.16.0.1',
    'http://172.31.255.255',
  ])('takes %p in a development build', (url) => {
    const { config, error } = parseConfig({ ...VALID, apiUrl: url, supabaseUrl: url }, DEV);

    expect(error).toBeNull();
    expect(config.apiUrl).toBe(url);
    expect(config.supabaseUrl).toBe(url);
  });

  it.each(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://192.168.1.20:8000'])(
    'refuses %p in a release build',
    (url) => {
      expect(errorFor({ ...VALID, apiUrl: url }, RELEASE)).toBe(
        'EXPO_PUBLIC_API_URL: not an allowed URL',
      );
    },
  );

  it.each([
    'http://api.doomskill.example',
    'http://8.8.8.8',
    'http://11.0.0.1',
    'http://127.0.0.2',
    'http://172.15.0.1',
    'http://172.32.0.1',
    'http://192.169.0.1',
    'http://localhost.doomskill.example',
    'http://10.doomskill.example',
    'http://192.168.1.1.nip.io',
    'http://[::2]',
  ])('refuses %p even in a development build', (url) => {
    expect(errorFor({ ...VALID, apiUrl: url }, DEV)).toBe(
      'EXPO_PUBLIC_API_URL: not an allowed URL',
    );
  });
});

describe('config, read once when the module loads', () => {
  const API_ENV = {
    EXPO_PUBLIC_API_URL: API,
    EXPO_PUBLIC_SUPABASE_URL: SUPABASE,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    EXPO_PUBLIC_DATA_SOURCE: 'api',
  };

  /** The module as it loads with `env` as the process environment. */
  function loadWith(env: Record<string, string>): typeof import('../config') {
    jest.replaceProperty(process, 'env', { NODE_ENV: 'test', ...env });
    let loaded: typeof import('../config') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('../config')>('../config');
    });
    if (loaded === undefined) {
      throw new Error('the config module did not load');
    }
    return loaded;
  }

  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the four EXPO_PUBLIC_ variables into a frozen config', () => {
    const { config, configError } = loadWith(API_ENV);

    expect(config).toStrictEqual(VALID);
    expect(Object.isFrozen(config)).toBe(true);
    // The same holds for the module every other file imports, whatever this run's environment.
    expect(Object.isFrozen(loadedConfig)).toBe(true);
    expect(configError).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('runs on the demo cards with no variable set', () => {
    const { config, configError } = loadWith({});

    expect(config).toStrictEqual({ ...EMPTY, dataSource: 'fixture' });
    expect(configError).toBeNull();
  });

  it('refuses a local http URL when the build is not a development build', () => {
    const dev: unknown = Reflect.get(globalThis, '__DEV__');
    const local = { ...API_ENV, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:8000' };
    try {
      expect(loadWith(local).configError).toBeNull();
      Reflect.set(globalThis, '__DEV__', false);
      expect(loadWith(local).configError).toBe('EXPO_PUBLIC_API_URL: not an allowed URL');
    } finally {
      Reflect.set(globalThis, '__DEV__', dev);
    }
  });

  it('gives the error and logs it once, naming the variable and not its value', () => {
    const { configError } = loadWith({
      EXPO_PUBLIC_API_URL: 'https://api.doomskill.example/?token=secret-marker',
      EXPO_PUBLIC_DATA_SOURCE: 'api',
    });

    expect(configError).toBe('EXPO_PUBLIC_API_URL: not an allowed URL');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('config_invalid', { problem: configError });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-marker');
  });
});

describe('buildTag, read fresh on every call', () => {
  const TAG = 'app-v1.0.0+abc1234';

  /**
   * `buildTag()` as it reads `tag` from the environment. A fresh module is required (the module
   * pattern `loadWith` above uses) because `EXPO_PUBLIC_` variables are inlined when the module
   * is first evaluated, so mutating `process.env` after this file's own top-level import would
   * not change what the already-loaded `buildTag` sees.
   */
  function tagWith(tag: string | undefined): string | null {
    jest.replaceProperty(process, 'env', { NODE_ENV: 'test', EXPO_PUBLIC_BUILD_TAG: tag });
    let loaded: typeof import('../config') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('../config')>('../config');
    });
    if (loaded === undefined) {
      throw new Error('the config module did not load');
    }
    return loaded.buildTag();
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads a validly shaped tag', () => {
    expect(tagWith(TAG)).toBe(TAG);
  });

  it('is null when unset', () => {
    expect(tagWith(undefined)).toBeNull();
  });

  it.each([
    'app-v1.0+abc1234', // missing the patch version
    'app-v1.0.0+ab', // sha too short
    'app-v1.0.0', // no sha at all
    'v1.0.0+abc1234', // missing the "app-" prefix
    'app-v1.0.0+ABCDEFG', // uppercase is not hex here
    '   ', // blank after trimming
  ])('treats %p as unset', (invalid) => {
    expect(tagWith(invalid)).toBeNull();
  });
});

describe('sourceUrl', () => {
  it('is the tagged tree for a known tag', () => {
    expect(sourceUrl('app-v1.0.0+abc1234')).toBe(`${SOURCE_REPOSITORY}/tree/app-v1.0.0+abc1234`);
  });

  it('is the repository itself with no tag', () => {
    expect(sourceUrl(null)).toBe(SOURCE_REPOSITORY);
  });
});

describe('the env files', () => {
  // The app's TypeScript project has no Node types, so the two Node functions are typed here.
  const { execFileSync } = jest.requireActual<{
    execFileSync: (file: string, args: string[], options?: { cwd: string }) => Uint8Array;
  }>('node:child_process');
  const { readFileSync } = jest.requireActual<{
    readFileSync: (path: string, encoding: 'utf8') => string;
  }>('node:fs');
  const decoder = new TextDecoder();

  function git(...args: string[]): string {
    return decoder.decode(execFileSync('git', args)).trim();
  }

  it('keeps apps/mobile/.env out of git', () => {
    const top = git('rev-parse', '--show-toplevel');

    // `git check-ignore` exits 1, which throws here, when the path is not ignored.
    expect(
      decoder.decode(execFileSync('git', ['check-ignore', 'apps/mobile/.env'], { cwd: top })),
    ).toBe('apps/mobile/.env\n');
  });

  it('lists the four names in .env.example, with the local stack and an empty key', () => {
    const top = git('rev-parse', '--show-toplevel');
    const lines = readFileSync(`${top}/apps/mobile/.env.example`, 'utf8')
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#'));

    expect(lines).toStrictEqual([
      'EXPO_PUBLIC_DATA_SOURCE=fixture',
      'EXPO_PUBLIC_API_URL=http://127.0.0.1:8000',
      'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY=',
    ]);
  });
});
