// EAS build hook (package.json's `eas-build-pre-install`, which EAS runs for every cloud build
// before anything else): refuses a `preview` or `production` build whose EXPO_PUBLIC_BUILD_TAG is
// not shaped like a published source tag. Strudel is AGPL-3.0-or-later and bundled into the app
// (REPO-7, docs/standards.md); K18 lifts the old ban once the shipped build's source is published
// under its tag (docs/publishing.md). Before this script the only enforcement was the human
// checklist (docs/deploy-checklist.md, steps e-g) — this is the build-time backstop.
//
// The pattern matches src/config.ts's buildTag(): a .mjs script cannot import a .ts module, so it
// is duplicated here; __tests__/check-build-tag.test.mjs pins the two equal.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BUILD_TAG = /^app-v\d+\.\d+\.\d+\+[0-9a-f]{7,40}$/;
const DISTRIBUTION_PROFILES = new Set(['preview', 'production']);
const RULE =
  'the published-tag rule (REPO-7 / K18, docs/standards.md): a preview or production build needs ' +
  'EXPO_PUBLIC_BUILD_TAG set, as an EAS environment variable (docs/deploy-checklist.md, step f), ' +
  'to a tag docs/publishing.md just published, shaped app-v<version>+<7-40 hex sha>';

/**
 * `{ code: 0 }` when `env.EAS_BUILD_PROFILE` is not `preview` or `production`, or its
 * `EXPO_PUBLIC_BUILD_TAG` matches a published tag's shape; else `{ code: 1, message }` naming the
 * rule this refuses under.
 * @param {NodeJS.ProcessEnv} env
 */
export function checkBuildTag(env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (profile === undefined || !DISTRIBUTION_PROFILES.has(profile)) return { code: 0 };
  const tag = typeof env.EXPO_PUBLIC_BUILD_TAG === 'string' ? env.EXPO_PUBLIC_BUILD_TAG.trim() : '';
  if (BUILD_TAG.test(tag)) return { code: 0 };
  return {
    code: 1,
    message: `check-build-tag: refused a "${profile}" build without a published source tag; ${RULE}`,
  };
}

/** Runs the check against `env`, writing a refusal to stderr. Returns the exit code. */
function main(env) {
  const result = checkBuildTag(env);
  if (result.message !== undefined) process.stderr.write(`${result.message}\n`);
  return result.code;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env);
}
