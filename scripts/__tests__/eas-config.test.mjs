// Guard for the build configuration. Strudel is AGPL-3.0-or-later and is bundled into the app
// (REPO-7, docs/standards.md); K18 lifts the distribution ban once the shipped build's source is
// published under its tag. eas.json holds exactly three profiles: `development` (unchanged,
// device-only), `preview` and `production` (internal/store distribution, gated at build time by
// `EXPO_PUBLIC_BUILD_TAG`, not by this file). No profile's `env` carries a secret, and every Apple
// credential in `submit` is a placeholder.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const MOBILE = join(import.meta.dirname, '..', '..');
const RULE = 'REPO-7 / K18 (docs/standards.md): the eas.json shape rule';
const BUNDLE_ID = 'com.frankiesoltero.learnloop';
const PROFILE_NAMES = ['development', 'preview', 'production'];
const PLACEHOLDER = /^REPLACE_ME/;
const URL_LIKE = /https?:\/\//;
const KEY_LIKE = /[A-Za-z0-9_-]{32,}/;

/** @param {string} name a JSON file in apps/mobile */
function readJson(name) {
  return JSON.parse(readFileSync(join(MOBILE, name), 'utf8'));
}

/** Problems with one profile's `env`: only `EXPO_PUBLIC_DATA_SOURCE`, required to be `"api"`
 * outside `development`. */
function envProblems(name, env) {
  if (env === undefined) {
    return name === 'development' ? [] : [`"${name}.env" must set EXPO_PUBLIC_DATA_SOURCE`];
  }
  const problems = Object.keys(env)
    .filter((key) => key !== 'EXPO_PUBLIC_DATA_SOURCE')
    .map((key) => `"${name}.env" holds "${key}"; only EXPO_PUBLIC_DATA_SOURCE is allowed`);
  if (name !== 'development' && env.EXPO_PUBLIC_DATA_SOURCE !== 'api') {
    problems.push(`"${name}.env.EXPO_PUBLIC_DATA_SOURCE" must be "api"`);
  }
  return problems;
}

/** Problems with the `development` profile beyond its `env` (always allowed to be absent). */
function developmentShapeProblems(profile) {
  return profile.developmentClient === true ? [] : ['"development.developmentClient" must be true'];
}

/** Problems with the `preview` profile beyond its `env`. */
function previewShapeProblems(profile) {
  const problems = [];
  if (profile.developmentClient === true)
    problems.push('"preview.developmentClient" must not be true');
  if (profile.distribution !== 'internal')
    problems.push('"preview.distribution" must be "internal"');
  if (profile.ios?.simulator !== false) problems.push('"preview.ios.simulator" must be false');
  return problems;
}

/** Problems with the `production` profile beyond its `env`. */
function productionShapeProblems(profile) {
  const problems = [];
  if (profile.developmentClient === true) {
    problems.push('"production.developmentClient" must not be true');
  }
  if (profile.distribution === 'internal') {
    problems.push('"production.distribution" must not be "internal"');
  }
  if (profile.autoIncrement !== true) problems.push('"production.autoIncrement" must be true');
  return problems;
}

const SHAPE_CHECKS = {
  development: developmentShapeProblems,
  preview: previewShapeProblems,
  production: productionShapeProblems,
};

/** Every string under one submit profile's `ios` block that is not a `REPLACE_ME` placeholder. */
function iosSubmitProblems(profileName, ios) {
  return Object.entries(ios ?? {})
    .filter(([, value]) => typeof value === 'string' && !PLACEHOLDER.test(value))
    .map(([key]) => `"submit.${profileName}.ios.${key}" must start with REPLACE_ME`);
}

/** Every `submit.*.ios` placeholder violation, plus a check that production submit exists. */
function submitProblems(submit) {
  const entries = Object.entries(submit ?? {});
  const problems = entries.flatMap(([name, profile]) => iosSubmitProblems(name, profile?.ios));
  if (submit?.production?.ios === undefined) problems.push('"submit.production.ios" is missing');
  return problems;
}

/** Walks the whole file for a value that looks like a URL or a secret key. */
function secretProblems(value, path) {
  if (typeof value === 'string') {
    const problems = [];
    if (URL_LIKE.test(value)) problems.push(`"${path}" holds a URL`);
    if (KEY_LIKE.test(value) && !PLACEHOLDER.test(value))
      problems.push(`"${path}" looks like a secret`);
    return problems;
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => secretProblems(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => secretProblems(v, `${path}.${k}`));
  }
  return [];
}

/** Fails, naming REPO-7 and K18, when eas.json does not match the distribution rule's shape. */
function checkEas(eas) {
  const build = eas.build ?? {};
  const names = Object.keys(build);
  const problems = [
    ...PROFILE_NAMES.filter((n) => !names.includes(n)).map(
      (n) => `build profile "${n}" is missing`,
    ),
    ...names
      .filter((n) => !PROFILE_NAMES.includes(n))
      .map((n) => `build profile "${n}" is not allowed`),
  ];
  for (const name of PROFILE_NAMES) {
    const profile = build[name];
    if (profile === undefined) continue;
    problems.push(...SHAPE_CHECKS[name](profile), ...envProblems(name, profile.env));
  }
  problems.push(...submitProblems(eas.submit));
  problems.push(...secretProblems(eas, 'eas.json'));
  if (problems.length > 0) assert.fail(`${RULE}. eas.json: ${problems.join('; ')}`);
}

/** Fails when the app config lacks the bundle identifier or asks for background audio. */
function checkApp(app) {
  assert.equal(app.expo?.ios?.bundleIdentifier, BUNDLE_ID);
  assert.equal(app.expo.ios.infoPlist?.UIBackgroundModes, undefined, 'no background modes');
}

test('eas.json has the development, preview and production profiles, no secret', () => {
  checkEas(readJson('eas.json'));
});

test('app.json sets the bundle identifier and no background modes', () => {
  checkApp(readJson('app.json'));
});

test('the app config check allows the keys eas init writes', () => {
  const extra = { eas: { projectId: '00000000-0000-4000-8000-000000000000' } };
  checkApp({ expo: { owner: 'someone', ios: { bundleIdentifier: BUNDLE_ID }, extra } });
});

const DEV = { developmentClient: true, distribution: 'internal', node: '22.23.3', pnpm: '11.8.0' };
const PREVIEW = {
  distribution: 'internal',
  channel: 'preview',
  node: '22.23.3',
  pnpm: '11.8.0',
  ios: { simulator: false },
  env: { EXPO_PUBLIC_DATA_SOURCE: 'api' },
};
const PRODUCTION = {
  channel: 'production',
  autoIncrement: true,
  node: '22.23.3',
  pnpm: '11.8.0',
  env: { EXPO_PUBLIC_DATA_SOURCE: 'api' },
};
const SUBMIT = {
  production: {
    ios: { appleId: 'REPLACE_ME', ascAppId: 'REPLACE_ME', appleTeamId: 'REPLACE_ME' },
  },
};
const VALID = {
  build: { development: DEV, preview: PREVIEW, production: PRODUCTION },
  submit: SUBMIT,
};

test('the eas.json check accepts the valid shape', () => {
  checkEas(VALID);
});

/** A deep clone of `VALID` with one field replaced, for one mutation per assertion. */
function mutate(path, value) {
  const copy = JSON.parse(JSON.stringify(VALID));
  const keys = path.split('.');
  let node = copy;
  for (const key of keys.slice(0, -1)) node = node[key];
  if (value === undefined) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
  return copy;
}

const REJECTED = {
  'a missing development profile': mutate('build.development', undefined),
  'a missing preview profile': mutate('build.preview', undefined),
  'a missing production profile': mutate('build.production', undefined),
  'an extra profile': { build: { ...VALID.build, staging: {} }, submit: SUBMIT },
  'developmentClient on preview': mutate('build.preview.developmentClient', true),
  'developmentClient on production': mutate('build.production.developmentClient', true),
  'preview not internal': mutate('build.preview.distribution', 'store'),
  'a preview simulator build': mutate('build.preview.ios.simulator', true),
  'production as internal distribution': mutate('build.production.distribution', 'internal'),
  'production without autoIncrement': mutate('build.production.autoIncrement', undefined),
  'an extra env key on preview': mutate('build.preview.env', {
    ...PREVIEW.env,
    EXPO_PUBLIC_API_URL: 'x',
  }),
  'preview env not api': mutate('build.preview.env.EXPO_PUBLIC_DATA_SOURCE', 'fixture'),
  'production env not api': mutate('build.production.env.EXPO_PUBLIC_DATA_SOURCE', 'fixture'),
  'a real Apple ID in submit': mutate('submit.production.ios.appleId', 'owner@example.com'),
  'a missing submit.production.ios': { build: VALID.build, submit: {} },
  // `channel` carries no shape rule of its own, so these two isolate the secret-pattern scan from
  // the env-key and placeholder checks above.
  'a URL inline': mutate('build.preview.channel', 'https://api.example.com/preview'),
  'a key-shaped value inline': mutate(
    'build.production.channel',
    'eyabcdefghijklmnopqrstuvwxyz0123456789',
  ),
};

for (const [name, eas] of Object.entries(REJECTED)) {
  test(`the eas.json check rejects ${name}, naming REPO-7 and K18`, () => {
    assert.throws(() => checkEas(eas), /REPO-7/);
    assert.throws(() => checkEas(eas), /K18/);
  });
}
