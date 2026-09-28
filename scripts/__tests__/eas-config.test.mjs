// Guard for the build configuration. Strudel is AGPL-3.0-or-later and is bundled into the app, so
// builds are for the owner's own devices only (docs/standards.md, REPO-7): eas.json holds one
// build profile, `development`, installed on registered devices, and no submit block. The app
// config keys that `eas init` writes (`extra.eas.projectId`, `owner`) are allowed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const MOBILE = join(import.meta.dirname, '..', '..');
const RULE = "REPO-7 (docs/standards.md): builds are for the owner's own devices only";
const BUNDLE_ID = 'com.frankiesoltero.learnloop';

/** @param {string} name a JSON file in apps/mobile */
function readJson(name) {
  return JSON.parse(readFileSync(join(MOBILE, name), 'utf8'));
}

/** The problems with the one allowed profile, `development`. */
function developmentProblems(profile) {
  if (profile === undefined) return ['build profile "development" is missing'];
  const problems = [];
  if (profile.developmentClient !== true) problems.push('"developmentClient" must be true');
  if (profile.distribution !== 'internal') problems.push('"distribution" must be "internal"');
  if (profile.ios?.simulator === true) problems.push('"ios.simulator" must not be true');
  if (profile.ios?.enterpriseProvisioning !== undefined) {
    problems.push('"ios.enterpriseProvisioning" is not allowed');
  }
  return problems;
}

/** Fails, naming REPO-7, when an eas.json allows a build for anyone but the owner. */
function checkEas(eas) {
  const { development, ...others } = eas.build ?? {};
  const problems = Object.keys(others).map((name) => `build profile "${name}" is not allowed`);
  if ('submit' in eas) problems.push('a "submit" block is not allowed');
  problems.push(...developmentProblems(development));
  if (problems.length > 0) assert.fail(`${RULE}. eas.json: ${problems.join('; ')}`);
}

/** Fails when the app config lacks the bundle identifier or asks for background audio. */
function checkApp(app) {
  assert.equal(app.expo?.ios?.bundleIdentifier, BUNDLE_ID);
  assert.equal(app.expo.ios.infoPlist?.UIBackgroundModes, undefined, 'no background modes');
}

const DEVELOPMENT = { developmentClient: true, distribution: 'internal' };
const withProfiles = (profiles) => ({ build: { development: DEVELOPMENT, ...profiles } });

test('eas.json has only the development profile, for registered devices', () => {
  checkEas(readJson('eas.json'));
});

test('app.json sets the bundle identifier and no background modes', () => {
  checkApp(readJson('app.json'));
});

test('the app config check allows the keys eas init writes', () => {
  const extra = { eas: { projectId: '00000000-0000-4000-8000-000000000000' } };
  checkApp({ expo: { owner: 'someone', ios: { bundleIdentifier: BUNDLE_ID }, extra } });
});

const REJECTED = {
  'a preview profile': withProfiles({ preview: { distribution: 'internal' } }),
  'a production profile': withProfiles({ production: {} }),
  'a submit block': { ...withProfiles({}), submit: { production: {} } },
  'store distribution': { build: { development: { ...DEVELOPMENT, distribution: 'store' } } },
  'no development client': { build: { development: { distribution: 'internal' } } },
  'a simulator-only build': {
    build: { development: { ...DEVELOPMENT, ios: { simulator: true } } },
  },
  'enterprise provisioning': {
    build: { development: { ...DEVELOPMENT, ios: { enterpriseProvisioning: 'universal' } } },
  },
  'no development profile': { build: {} },
};

for (const [name, eas] of Object.entries(REJECTED)) {
  test(`the eas.json check rejects ${name}, naming REPO-7`, () => {
    assert.throws(() => checkEas(eas), /REPO-7/);
  });
}

test('the eas.json check accepts the development profile alone', () => {
  checkEas(withProfiles({}));
});
