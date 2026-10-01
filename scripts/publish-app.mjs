// Publishes the app's source: the history of apps/mobile, split out with `git subtree split`, as
// `main` of the public repository, with the tag `app-v<version>+<short sha>` that a build carries
// in EXPO_PUBLIC_BUILD_TAG (src/config.ts, buildTag()). docs/publishing.md is the owner's guide.
//
//   pnpm --filter mobile run publish:app -- --dry-run     (the default) checks and prints only
//   pnpm --filter mobile run publish:app -- --push        then pushes `main` and the tag
//   --remote <url>                                        another remote (tests use a local one)
//
// Refusals, each before anything leaves the machine: a dirty working tree or HEAD not on
// origin/main (exit 1); a .env file or a gitleaks finding in ANY commit of the split (exit 2); for
// --push, a remote that does not exist yet (exit 3) and a remote whose `main` the split does not
// fast-forward (exit 1). A push is never forced, and goes out atomically: `main` and the tag
// together or neither. A push makes the history public at once and cannot be fully taken back;
// docs/publishing.md has the recovery steps. The temporary branch and tag are always deleted.
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  DEFAULT_REMOTE,
  PublishError,
  envFiles,
  git,
  out,
  safeRemote,
  say,
  secretFindings,
  spawn,
  topLevel,
  webUrl,
} from './publish-lib.mjs';

const PREFIX = 'apps/mobile';
const VERSION = /^\d+\.\d+\.\d+$/;
// The shape src/config.ts's buildTag() accepts: a tag the app would reject is never created.
const BUILD_TAG = /^app-v\d+\.\d+\.\d+\+[0-9a-f]{7,40}$/;
const NOTHING_PUSHED = 'nothing was pushed';

function parseOptions(argv) {
  // `pnpm run <script> -- --push` hands the script the `--` too.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        'dry-run': { type: 'boolean', default: false },
        push: { type: 'boolean', default: false },
        remote: { type: 'string', default: DEFAULT_REMOTE },
      },
    }));
  } catch (error) {
    throw new PublishError(`${error instanceof Error ? error.message : String(error)}`);
  }
  if (values.push && values['dry-run']) {
    throw new PublishError('pass --dry-run or --push, not both');
  }
  if (values.remote === '' || values.remote.startsWith('-')) {
    throw new PublishError('--remote needs a repository URL');
  }
  return { push: values.push, remote: values.remote };
}

/** One line per noun: `1 .env file`, `2 .env files`. */
function counted(count, noun) {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** Refuses unless the tree is clean and HEAD is exactly origin/main. */
function checkCheckout(root) {
  if (git(root, 'status', '--porcelain') !== '') {
    throw new PublishError(
      `the working tree is not clean; commit or stash first; ${NOTHING_PUSHED}`,
    );
  }
  git(root, 'fetch', '--quiet', 'origin', 'main');
  if (git(root, 'rev-parse', 'HEAD') !== git(root, 'rev-parse', 'refs/remotes/origin/main')) {
    throw new PublishError(`HEAD is not origin/main; push or pull main first; ${NOTHING_PUSHED}`);
  }
}

/** The version in apps/mobile/app.json at HEAD, the short sha of HEAD, and the tag from both. */
function tagFor(root) {
  const appJson = JSON.parse(git(root, 'show', `HEAD:${PREFIX}/app.json`));
  const version = appJson?.expo?.version;
  if (typeof version !== 'string' || !VERSION.test(version)) {
    throw new PublishError(`${PREFIX}/app.json needs expo.version as <major>.<minor>.<patch>`);
  }
  const sha = git(root, 'rev-parse', '--short=7', 'HEAD');
  const tag = `app-v${version}+${sha}`;
  if (!BUILD_TAG.test(tag)) throw new PublishError(`the tag ${tag} is not a valid build tag`);
  return { version, sha, tag };
}

/** Refuses, with exit 2, when any commit of the split holds a .env file or a secret. */
function checkHistory(root, branch) {
  const envs = envFiles(root, branch);
  if (envs.length > 0) {
    throw new PublishError(
      `${counted(envs.length, '.env file')} in the split history; ${NOTHING_PUSHED}`,
      { code: 2, details: envs },
    );
  }
  const findings = secretFindings(root, branch);
  if (findings.length > 0) {
    throw new PublishError(
      `${counted(findings.length, 'secret finding')} in the split history; ${NOTHING_PUSHED}`,
      { code: 2, details: findings },
    );
  }
}

function printSummary(root, context) {
  const { branch, tag, remote } = context;
  out(`tag:         ${tag}`);
  out(`branch:      ${branch}`);
  out(`commits:     ${git(root, 'rev-list', '--count', branch)}`);
  out(`remote:      ${safeRemote(remote)}`);
  out('secret scan: clean (gitleaks and the .env check, every commit of the split)');
  out('files:');
  for (const name of topLevel(root, branch)) out(`  ${name}`);
}

/** Pushes the split as the remote's `main` and the annotated tag, atomically, never forced. */
function push(root, context) {
  const { branch, tag, remote, version, sha } = context;
  if (spawn('git', ['ls-remote', '--', remote], root).status !== 0) {
    throw new PublishError(
      `create the public repository first (empty, public): ${safeRemote(remote)}; ${NOTHING_PUSHED}`,
      { code: 3 },
    );
  }
  git(root, 'tag', '-a', '-m', `LearnLoop app ${version} at ${sha}`, tag, branch);
  context.tagCreated = true;
  const refs = [`refs/heads/${branch}:refs/heads/main`, `refs/tags/${tag}:refs/tags/${tag}`];
  const result = spawn('git', ['push', '--atomic', '--quiet', remote, ...refs], root);
  if (result.status !== 0) {
    throw new PublishError(
      'the remote refused the push; nothing was forced and nothing was pushed. Its main has ' +
        'diverged from the split, or the tag exists there: see docs/publishing.md',
    );
  }
  const web = webUrl(remote);
  out(`pushed:      ${web ?? `${safeRemote(remote)} main`}`);
  out(`source:      ${web ? `${web}/tree/${tag}` : `${safeRemote(remote)} ${tag}`}`);
}

/** Deletes the temporary tag and branch; says so when one cannot be deleted. */
function cleanUp(root, context) {
  const refs = [];
  if (context.tagCreated) refs.push(['tag', '-d', context.tag]);
  // A split that failed part-way may or may not have created the branch.
  const branchRef = `refs/heads/${context.branch}`;
  if (spawn('git', ['rev-parse', '--verify', '--quiet', branchRef], root).status === 0) {
    refs.push(['branch', '-D', context.branch]);
  }
  for (const args of refs) {
    const result = spawn('git', args, root);
    if (result.status !== 0) say(`could not delete ${args[2] ?? ''}; delete it by hand`);
  }
}

function publish(root, options) {
  checkCheckout(root);
  const branch = `publish-${randomBytes(4).toString('hex')}`;
  const context = { ...tagFor(root), remote: options.remote, branch, tagCreated: false };
  try {
    git(root, 'subtree', 'split', `--prefix=${PREFIX}`, '-b', branch);
    checkHistory(root, branch);
    printSummary(root, context);
    if (options.push) push(root, context);
    else out(`dry run: ${NOTHING_PUSHED}; run with --push to publish`);
  } finally {
    cleanUp(root, context);
  }
}

/** Runs the script. Returns the exit code. */
function main(argv) {
  try {
    const options = parseOptions(argv);
    const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
    publish(root, options);
    return 0;
  } catch (error) {
    if (!(error instanceof PublishError)) {
      say(`failed: ${error instanceof Error ? error.message : String(error)}; ${NOTHING_PUSHED}`);
      return 1;
    }
    say(error.message);
    for (const line of error.details) process.stderr.write(`  ${line}\n`);
    return error.code;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
