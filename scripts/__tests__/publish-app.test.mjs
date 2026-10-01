// Tests for scripts/publish-app.mjs. Every case builds its own temporary monorepo with a fake
// apps/mobile, an `origin` that is a local bare repository, and (for --push) a local bare
// "public" repository; nothing touches this repository or a network remote. The secret scan is
// the script's safety, so a machine without gitleaks fails these tests instead of skipping them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { DEFAULT_REMOTE, safeRemote, webUrl } from '../publish-lib.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'publish-app.mjs');
const CONFIG = join(import.meta.dirname, '..', '..', 'src', 'config.ts');
// The shape src/config.ts's buildTag() accepts; a tag the app would reject is useless.
const BUILD_TAG = /^app-v\d+\.\d+\.\d+\+[0-9a-f]{7,40}$/;
const VERSION = '1.4.2';

const work = mkdtempSync(join(tmpdir(), 'publish-app-test-'));
after(() => rmSync(work, { recursive: true, force: true }));
let count = 0;

/** Runs git in `cwd`; fails the test when git fails. Returns trimmed stdout. */
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** Writes `files` ({path: text}) under the repository and commits them. */
function commit(repo, files, message) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '-m', message);
}

/** Deletes a tracked file and commits the deletion. */
function remove(repo, path, message) {
  git(repo, 'rm', '--quiet', path);
  git(repo, 'commit', '--quiet', '-m', message);
}

/** A bare repository under the test folder. */
function bare(name) {
  const path = join(work, name);
  git(work, 'init', '--quiet', '--bare', '-b', 'main', path);
  return path;
}

/** A monorepo with two commits, pushed to its `origin`, so HEAD is origin/main. */
function makeRepo() {
  count += 1;
  const repo = join(work, `repo-${count}`);
  const origin = bare(`origin-${count}.git`);
  git(work, 'init', '--quiet', '-b', 'main', repo);
  git(repo, 'config', 'user.name', 'Publish Test');
  git(repo, 'config', 'user.email', 'publish-test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'config', 'tag.gpgsign', 'false');
  commit(
    repo,
    {
      'apps/mobile/app.json': JSON.stringify({ expo: { name: 'LearnLoop', version: VERSION } }),
      'apps/mobile/.env.example': 'EXPO_PUBLIC_DATA_SOURCE=fixture\n',
      'services/api/main.py': 'print("not part of the app")\n',
    },
    'first',
  );
  commit(repo, { 'apps/mobile/src/index.js': 'export const one = 1;\n' }, 'second');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '--quiet', 'origin', 'main');
  git(repo, 'fetch', '--quiet', 'origin');
  return repo;
}

/** Pushes the repository's main to its origin, so HEAD is origin/main again. */
function sync(repo) {
  git(repo, 'push', '--quiet', 'origin', 'main');
}

function run(repo, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
}

/** The tag the script must compute for the repository's HEAD. */
function expectedTag(repo) {
  return `app-v${VERSION}+${git(repo, 'rev-parse', '--short=7', 'HEAD')}`;
}

/** Asserts the script left no temporary branch, worktree or local tag behind. */
function assertClean(repo) {
  assert.equal(git(repo, 'branch', '--list', 'publish-*'), '');
  assert.equal(git(repo, 'worktree', 'list').split('\n').length, 1);
  assert.equal(git(repo, 'tag', '--list'), '');
}

/** A string gitleaks' default aws-access-token rule matches, built so this file holds none. */
function fakeAwsKey() {
  return ['AK', 'IA', 'QWERTYUIOP', 'ASDFGH'].join('');
}

test('gitleaks is installed: the scan is the safety, so its absence fails', () => {
  const result = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  assert.equal(result.error, undefined, 'gitleaks not on PATH: brew install gitleaks');
  assert.equal(result.status, 0);
});

test('the default remote is the repository the app links to (src/config.ts)', () => {
  const source = /SOURCE_REPOSITORY = '([^']+)'/.exec(readFileSync(CONFIG, 'utf8'))?.[1];
  assert.equal(webUrl(DEFAULT_REMOTE), source);
});

test('a remote is printed without credentials', () => {
  const remote = 'https://someone:hunter2@github.com/FrankieSoltero/learnloop-app.git';
  assert.equal(safeRemote(remote).includes('hunter2'), false);
  assert.equal(safeRemote(remote).includes('someone'), false);
  assert.equal(webUrl(remote), 'https://github.com/FrankieSoltero/learnloop-app');
  assert.equal(safeRemote('/tmp/public.git'), '/tmp/public.git');
});

test('dry run (the default) prints the tag, the commit count and the split files', () => {
  const repo = makeRepo();
  const result = run(repo);
  assert.equal(result.status, 0, result.stderr);
  const tag = expectedTag(repo);
  assert.match(tag, BUILD_TAG);
  assert.match(result.stdout, new RegExp(`^tag: +${tag.replace('+', '\\+')}$`, 'm'));
  assert.match(result.stdout, /^branch: +publish-[0-9a-f]{8}$/m);
  assert.match(result.stdout, /^commits: +2$/m);
  assert.match(result.stdout, /^secret scan: +clean/m);
  assert.match(result.stdout, /^ {2}\.env\.example\n {2}app\.json\n {2}src\/$/m);
  assert.doesNotMatch(result.stdout, /services|main\.py/);
  assert.match(result.stdout, /nothing was pushed/);
  assertClean(repo);
});

test('--dry-run, also after the `--` pnpm passes on, behaves as the default', () => {
  const repo = makeRepo();
  for (const args of [['--dry-run'], ['--', '--dry-run']]) {
    const result = run(repo, ...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /nothing was pushed/);
  }
  assertClean(repo);
});

test('refuses a dirty working tree, before splitting anything', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, 'apps/mobile/stray.js'), 'export {};\n');
  const result = run(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /working tree is not clean/);
  assert.doesNotMatch(result.stdout, /^tag:/m);
  assertClean(repo);
});

test('refuses when HEAD is ahead of origin/main', () => {
  const repo = makeRepo();
  commit(repo, { 'apps/mobile/src/two.js': 'export const two = 2;\n' }, 'unpushed');
  const result = run(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEAD is not origin\/main/);
  assertClean(repo);
});

test('refuses unknown options and both modes at once', () => {
  const repo = makeRepo();
  for (const args of [['--allow-dirty'], ['--push', '--dry-run'], ['--remote', '-x']]) {
    const result = run(repo, ...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /^publish-app: /);
  }
  assertClean(repo);
});

test('refuses with exit 2 when a historical commit of the split held a .env file', () => {
  const repo = makeRepo();
  commit(repo, { 'apps/mobile/config/.env.local': 'TOKEN=placeholder\n' }, 'add env');
  remove(repo, 'apps/mobile/config/.env.local', 'remove env');
  sync(repo);
  const result = run(repo);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /1 \.env file in the split history; nothing was pushed/);
  assert.match(result.stderr, /config\/\.env\.local/);
  assert.doesNotMatch(result.stdout, /^secret scan: +clean/m);
  assertClean(repo);
});

test('a .env file outside apps/mobile is not in the split and does not refuse', () => {
  const repo = makeRepo();
  commit(repo, { 'services/api/.env.local': 'TOKEN=placeholder\n' }, 'add env');
  remove(repo, 'services/api/.env.local', 'remove env');
  sync(repo);
  assert.equal(run(repo).status, 0);
  assertClean(repo);
});

test('refuses with exit 2 when a historical commit of the split held a key', () => {
  const repo = makeRepo();
  const key = fakeAwsKey();
  commit(repo, { 'apps/mobile/creds.txt': `aws_access_key_id = ${key}\n` }, 'add key');
  remove(repo, 'apps/mobile/creds.txt', 'remove key');
  sync(repo);
  const result = run(repo);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /1 secret finding in the split history; nothing was pushed/);
  assert.match(result.stderr, /aws-access-token creds\.txt [0-9a-f]{7}/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(key), false, 'the key was printed');
  assertClean(repo);
});

test('--push to a missing remote exits 3 with one line and creates nothing', () => {
  const repo = makeRepo();
  const missing = join(work, `missing-${count}.git`);
  const result = run(repo, '--push', '--remote', missing);
  assert.equal(result.status, 3);
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0] ?? '', /create the public repository first/);
  assert.equal(spawnSync('git', ['ls-remote', missing]).status === 0, false);
  assertClean(repo);
});

test('--push publishes the split as main with an annotated tag, then fast-forwards', () => {
  const repo = makeRepo();
  const target = bare(`public-${count}.git`);
  const first = run(repo, '--push', '--remote', target);
  assert.equal(first.status, 0, first.stderr);
  const tag = expectedTag(repo);
  assert.equal(git(target, 'cat-file', '-t', `refs/tags/${tag}`), 'tag');
  assert.equal(git(target, 'rev-parse', `${tag}^{commit}`), git(target, 'rev-parse', 'main'));
  const sha = git(repo, 'rev-parse', '--short=7', 'HEAD');
  assert.equal(
    git(target, 'tag', '-l', '--format=%(contents:subject)', tag),
    `LearnLoop app ${VERSION} at ${sha}`,
  );
  assert.equal(git(target, 'ls-tree', '--name-only', 'main'), '.env.example\napp.json\nsrc');
  assert.match(first.stdout, /^pushed: /m);
  assertClean(repo);

  commit(repo, { 'apps/mobile/src/three.js': 'export const three = 3;\n' }, 'third');
  sync(repo);
  const before = git(target, 'rev-parse', 'main');
  const second = run(repo, '--push', '--remote', target);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(git(target, 'rev-parse', 'main^'), before);
  assert.equal(git(target, 'tag', '--list').split('\n').length, 2);
  assertClean(repo);
});

test('--push refuses, without forcing, when the public main has diverged', () => {
  const repo = makeRepo();
  const target = bare(`public-${count}.git`);
  const other = join(work, `other-${count}`);
  git(work, 'clone', '--quiet', target, other);
  git(other, 'config', 'user.name', 'Publish Test');
  git(other, 'config', 'user.email', 'publish-test@example.com');
  git(other, 'config', 'commit.gpgsign', 'false');
  commit(other, { 'README.md': 'created on the host\n' }, 'unrelated');
  git(other, 'push', '--quiet', 'origin', 'main');
  const before = git(target, 'rev-parse', 'main');
  const result = run(repo, '--push', '--remote', target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refused the push; nothing was forced/);
  assert.equal(git(target, 'rev-parse', 'main'), before);
  assert.equal(git(target, 'tag', '--list'), '');
  assertClean(repo);
});
