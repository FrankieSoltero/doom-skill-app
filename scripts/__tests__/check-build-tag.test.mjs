// Tests for scripts/check-build-tag.mjs, the EAS `eas-build-pre-install` hook. Each case spawns
// the real script as EAS would, with a fixed environment, and checks its exit code and (for a
// refusal) that the message names the published-tag rule (REPO-7 / K18).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'check-build-tag.mjs');
const CONFIG = join(import.meta.dirname, '..', '..', 'src', 'config.ts');
// The shape src/config.ts's buildTag() accepts; duplicated because a .mjs cannot import a .ts
// module. The test below pins this equal to src/config.ts's own pattern.
const BUILD_TAG = /^app-v\d+\.\d+\.\d+\+[0-9a-f]{7,40}$/;
const VALID_TAG = 'app-v1.0.0+bf25e2d';

/** Runs the script with `env` layered over a clean base (no inherited build-tag variables). */
function run(env) {
  const base = { ...process.env };
  delete base.EAS_BUILD_PROFILE;
  delete base.EXPO_PUBLIC_BUILD_TAG;
  return spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...base, ...env } });
}

test('its BUILD_TAG pattern matches src/config.ts', () => {
  const source = readFileSync(CONFIG, 'utf8');
  const match = /const BUILD_TAG = (\/.*\/);/.exec(source);
  assert.ok(match, 'could not find BUILD_TAG in src/config.ts');
  assert.equal(BUILD_TAG.toString(), match[1]);
});

test('refuses a preview build with no EXPO_PUBLIC_BUILD_TAG', () => {
  const result = run({ EAS_BUILD_PROFILE: 'preview' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REPO-7/);
  assert.match(result.stderr, /K18/);
});

test('refuses a production build whose tag does not match the published-tag shape', () => {
  const result = run({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_BUILD_TAG: 'v1.0.0' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /published-tag rule/);
});

test('allows a preview build whose tag matches the published-tag shape', () => {
  const result = run({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_BUILD_TAG: VALID_TAG });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('allows a development build, and a build with no EAS_BUILD_PROFILE, with no tag', () => {
  const development = run({ EAS_BUILD_PROFILE: 'development' });
  assert.equal(development.status, 0);
  const noProfile = run({});
  assert.equal(noProfile.status, 0);
});
