// Helpers for scripts/publish-app.mjs: running git and gitleaks without a shell, the two history
// checks on the split branch (no .env file in any commit, no gitleaks finding in any commit), and
// the remote's display forms, which never carry credentials. docs/publishing.md is the guide.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The public repository. Its web form is SOURCE_REPOSITORY in src/config.ts (a test checks). */
export const DEFAULT_REMOTE = 'https://github.com/FrankieSoltero/doom-skill-app.git';

// A path in the split whose name starts with `.env`, in any folder. `.env.example` files list
// variable names without secrets and are tracked on purpose (REPO-3), so they are allowed;
// gitleaks still scans their content in every commit.
const ENV_FILE = /(^|\/)\.env/;
const ENV_TEMPLATE = /(^|\/)\.env\.example$/;
// gitleaks exits with this code on a finding, so a finding is told apart from a failed scan.
const LEAKS_EXIT = 42;
// `git log` options that put every commit's own diff in the output: `-m` gives a merge commit a
// diff against each parent (plain `git log -p` shows none, so a key added while resolving a merge
// would go unread), and `--root` gives the root commit its diff whatever `log.showRoot` says.
const HISTORY = ['-m', '--root'];
const GITHUB_SSH = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

/** Thrown for a refusal or a failure with its own message, printed as is; `code` is the exit. */
export class PublishError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: number, details?: string[] }} [extra]
   */
  constructor(message, extra = {}) {
    super(message);
    this.code = extra.code ?? 1;
    this.details = extra.details ?? [];
  }
}

/** Writes one line to stderr, prefixed with the script's name. */
export function say(line) {
  process.stderr.write(`publish-app: ${line}\n`);
}

/** Writes one line to stdout. */
export function out(line) {
  process.stdout.write(`${line}\n`);
}

/** The first non-empty line of a tool's stderr, for a one-line failure message. */
function firstLine(text) {
  return (text ?? '').split('\n').find((line) => line.trim() !== '') ?? 'no message';
}

/** Runs a command with arguments (no shell) in `cwd`. A missing binary is a PublishError. */
export function spawn(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) {
    throw new PublishError(`${command} could not run: ${result.error.message}`);
  }
  return result;
}

/** Runs git in `root` and returns its trimmed stdout; a failure is a PublishError. */
export function git(root, ...args) {
  const result = spawn('git', args, root);
  if (result.status !== 0) {
    throw new PublishError(`git ${args[0]} failed: ${firstLine(result.stderr)}`);
  }
  return result.stdout.trim();
}

/** Every path, in every commit of `branch`, that is a .env file other than a template. */
export function envFiles(root, branch) {
  // -m lists a merge's changes against each parent, so a file added in a merge resolution is
  // listed; --root lists the root commit's files even when `log.showRoot` is off; --no-renames
  // lists a renamed file's old name too. Names are split on NUL and newline, so an odd name can
  // only split into more names.
  const names = git(
    root,
    'log',
    '-z',
    ...HISTORY,
    '--no-renames',
    '--name-only',
    '--format=',
    branch,
  );
  const paths = new Set(names.split(/[\0\n]+/).filter((name) => name !== ''));
  return [...paths].filter((path) => ENV_FILE.test(path) && !ENV_TEMPLATE.test(path)).sort();
}

/**
 * gitleaks' arguments: every commit reachable from `branch`, merges and the root included, redacted,
 * with the repo's config. gitleaks runs `git log -p -U0 <log-opts>`, split on spaces.
 */
function gitleaksArgs(root, branch, report) {
  const config = join(root, '.gitleaks.toml');
  return [
    'git',
    '--no-banner',
    '--redact',
    `--log-opts=${[...HISTORY, branch].join(' ')}`,
    '--report-format=json',
    `--report-path=${report}`,
    `--exit-code=${String(LEAKS_EXIT)}`,
    ...(existsSync(config) ? [`--config=${config}`] : []),
    root,
  ];
}

/**
 * Runs gitleaks over every commit of `branch` and returns its findings as one line each (rule,
 * file, commit; the secret itself is redacted). A scan that cannot run or fails is a PublishError.
 */
export function secretFindings(root, branch) {
  const folder = mkdtempSync(join(tmpdir(), 'publish-app-scan-'));
  try {
    const report = join(folder, 'report.json');
    const result = spawnSync('gitleaks', gitleaksArgs(root, branch, report), {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.error) {
      throw new PublishError('gitleaks not installed: brew install gitleaks; nothing was pushed');
    }
    if (result.status !== 0 && result.status !== LEAKS_EXIT) {
      throw new PublishError(`the secret scan failed: ${firstLine(result.stderr)}`);
    }
    const findings = JSON.parse(readFileSync(report, 'utf8'));
    if (!Array.isArray(findings) || (result.status === LEAKS_EXIT) !== findings.length > 0) {
      throw new PublishError('the secret scan wrote a report this script cannot read');
    }
    return findings.map((f) => `${f.RuleID} ${f.File} ${String(f.Commit).slice(0, 7)}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** The first-level entries of `branch`'s tree, folders with a trailing slash. */
export function topLevel(root, branch) {
  const entries = git(root, 'ls-tree', '-z', branch).split('\0');
  return entries
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [meta = '', name = ''] = entry.split('\t');
      return meta.split(' ')[1] === 'tree' ? `${name}/` : name;
    });
}

/** The remote as it may be printed: a URL loses any user name and password. */
export function safeRemote(remote) {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) return remote;
  try {
    const url = new URL(remote);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '<remote>';
  }
}

/** The repository's web address for a GitHub remote, else null. */
export function webUrl(remote) {
  const ssh = GITHUB_SSH.exec(remote);
  if (ssh) return `https://github.com/${ssh[1] ?? ''}/${ssh[2] ?? ''}`;
  const safe = safeRemote(remote);
  const https = /^(?:https|ssh):\/\/(?:[^/]*@)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;
  const match = https.exec(safe);
  return match ? `https://github.com/${match[1] ?? ''}/${match[2] ?? ''}` : null;
}
