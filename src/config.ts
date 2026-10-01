/**
 * The app's configuration, read once when this module loads: the one place the app reads the
 * environment (rule SS-4 in docs/standards.md; ESLint rejects `process.env` everywhere else).
 *
 * Expo puts the `EXPO_PUBLIC_` variables into the bundle when it is built, from the process
 * environment and from `apps/mobile/.env*` files (`.env.example` lists them); the app never reads
 * a file at run time. Each is read with a static property access, the form Expo replaces. Only
 * public values go here: the API's base URL, the Supabase URL and the anon key, which is public
 * by design. Never a secret.
 *
 * - `EXPO_PUBLIC_DATA_SOURCE`: `api` or `fixture`; unset or empty is `fixture`, the demo cards.
 * - `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`: `https`, or `http` only in a development
 *   build (`__DEV__`) and only for a loopback or private host (`localhost`, `127.0.0.1`, `::1`,
 *   `10.*`, `192.168.*`, `172.16.*` to `172.31.*`). No user, password, query or fragment. Kept
 *   without a trailing slash.
 * - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: any text without whitespace.
 *
 * With the `api` source all three are required. With `fixture` they are not used: each is kept
 * when it passes its check, else it is empty. A problem is `configError`, which names the
 * variable and never its value; the root layout then shows a fixed message from `copy` instead of
 * the app, and the problem is logged once here as `config_invalid`.
 */
import { logWarning } from './log';

type DataSource = 'api' | 'fixture';

interface AppConfig {
  readonly apiUrl: string;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly dataSource: DataSource;
}

/** The variables as the environment gives them: each may be missing. */
export interface RawConfig {
  apiUrl?: string | undefined;
  supabaseUrl?: string | undefined;
  supabaseAnonKey?: string | undefined;
  dataSource?: string | undefined;
}

interface Parsed {
  config: AppConfig;
  error: string | null;
}

type Checked = { value: string } | { problem: string };

const MISSING = 'missing';
const NOT_A_URL = 'not an allowed URL';
const NOT_A_KEY = 'not a key';
/** `EXPO_PUBLIC_DATA_SOURCE` may be unset, empty, `api` or `fixture`. */
const KNOWN_SOURCES = ['', 'api', 'fixture'];
const UNKNOWN_SOURCE = 'EXPO_PUBLIC_DATA_SOURCE: not api or fixture';

/** A private IPv4 address: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. */
const PRIVATE_IPV4 = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/;

/** The hosts `http` may name in a development build (as `URL` writes them, IPv6 in brackets). */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    PRIVATE_IPV4.test(hostname)
  );
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function checkUrl(text: string, dev: boolean): Checked {
  const url = parseUrl(text);
  if (url === null || url.username !== '' || url.password !== '') {
    return { problem: NOT_A_URL };
  }
  const secure = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && dev && isLocalHost(url.hostname);
  if ((!secure && !localHttp) || /[?#]/.test(text)) {
    return { problem: NOT_A_URL };
  }
  return { value: url.href.replace(/\/+$/, '') };
}

function checkKey(text: string): Checked {
  return /\s/.test(text) ? { problem: NOT_A_KEY } : { value: text };
}

function check(raw: string | undefined, checker: (text: string) => Checked): Checked {
  const text = raw?.trim() ?? '';
  return text === '' ? { problem: MISSING } : checker(text);
}

/**
 * The configuration in `raw` for a development build (`dev`) or a release build, and the first
 * problem, naming its variable (see the module docstring).
 */
export function parseConfig(raw: RawConfig, dev: boolean): Parsed {
  const source = raw.dataSource?.trim() ?? '';
  const dataSource: DataSource = source === 'api' ? 'api' : 'fixture';
  const url = (text: string) => checkUrl(text, dev);
  const fields = [
    ['apiUrl', 'EXPO_PUBLIC_API_URL', check(raw.apiUrl, url)],
    ['supabaseUrl', 'EXPO_PUBLIC_SUPABASE_URL', check(raw.supabaseUrl, url)],
    ['supabaseAnonKey', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', check(raw.supabaseAnonKey, checkKey)],
  ] as const;
  const values = { apiUrl: '', supabaseUrl: '', supabaseAnonKey: '' };
  let error = KNOWN_SOURCES.includes(source) ? null : UNKNOWN_SOURCE;
  for (const [field, variable, checked] of fields) {
    if ('value' in checked) {
      values[field] = checked.value;
    } else if (dataSource === 'api') {
      error ??= `${variable}: ${checked.problem}`;
    }
  }
  return { config: { ...values, dataSource }, error };
}

/**
 * A variable as the bundle holds it: text, or missing. Expo types `process.env`'s other keys as
 * `any`, so each read is checked here.
 */
function envText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The app's public source repository (`apps/mobile/README.md`'s Licence section); the only place
 * the host appears, so a changed repository name or owner is a one-line change.
 */
export const SOURCE_REPOSITORY = 'https://github.com/FrankieSoltero/learnloop-app';

/** A release build tag as the app's build step writes it: `app-v<semver>+<7-40 hex sha>`. */
const BUILD_TAG = /^app-v\d+\.\d+\.\d+\+[0-9a-f]{7,40}$/;

/**
 * `EXPO_PUBLIC_BUILD_TAG` when it is shaped like a build tag; `null` when it is unset or any other
 * shape (a development build never sets it).
 */
export function buildTag(): string | null {
  const raw = envText(process.env.EXPO_PUBLIC_BUILD_TAG)?.trim() ?? '';
  return BUILD_TAG.test(raw) ? raw : null;
}

/**
 * The source for `tag`: the tagged tree on GitHub, or the repository's root when there is no tag
 * (a development build).
 */
export function sourceUrl(tag: string | null): string {
  return tag === null ? SOURCE_REPOSITORY : `${SOURCE_REPOSITORY}/tree/${tag}`;
}

const parsed = parseConfig(
  {
    apiUrl: envText(process.env.EXPO_PUBLIC_API_URL),
    supabaseUrl: envText(process.env.EXPO_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: envText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    dataSource: envText(process.env.EXPO_PUBLIC_DATA_SOURCE),
  },
  __DEV__,
);

/** The app's configuration. With `configError` set, the app does not use it. */
export const config: AppConfig = Object.freeze(parsed.config);

/** The first problem with the configuration, naming the variable; `null` when there is none. */
export const configError: string | null = parsed.error;

if (configError !== null) {
  logWarning('config_invalid', { problem: configError });
}
