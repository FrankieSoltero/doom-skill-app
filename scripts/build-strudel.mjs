// Bundles @strudel/web and the WebView page's player (src/strudel/page/) into one HTML document
// and writes it, as a string, into the generated module src/strudel/generated/strudelHtml.ts. The
// module also holds FRAME_GUARD_SCRIPT, the script the WebView runs before content in every frame:
// the page's own dialogs.js and webrtc.js, bundled from FRAME_ENTRY below.
// The mobile package's `build:strudel` script runs it, and so does its `postinstall`, so the
// module exists after every `pnpm install`. Strudel is AGPL-3.0-or-later: a distribution build
// that bundles it is made only once the exact source it was built from is published under its
// tag (docs/standards.md, REPO-7; docs/publishing.md).
//
// Options, for tests: --out <file> writes elsewhere; --resolve-from <dir> resolves esbuild and
// @strudel/web from that folder; --entry <file> bundles that file instead of the page;
// --postinstall exits 0 with one line when neither package is installed (an install without
// devDependencies), so that install does not fail.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import vm from 'node:vm';

const PACKAGE_DIR = dirname(import.meta.dirname);
const PAGE_DIR = join(PACKAGE_DIR, 'src', 'strudel', 'page');
const DEFAULT_OUT = join(PACKAGE_DIR, 'src', 'strudel', 'generated', 'strudelHtml.ts');
const PLACEHOLDER = '/* STRUDEL_BUNDLE */';
const COMMAND = 'pnpm --filter mobile run build:strudel';
// The oldest browser the page must parse in: WKWebView on the app's minimum iOS. app.json sets no
// ios.deploymentTarget, so it is Expo SDK 57's default, iOS 16.4 (the template Podfile's
// `platform :ios, ... || '16.4'`, and ExpoModulesCore.podspec's `:ios => '16.4'`), above React
// Native 0.86's own minimum of 15.1. iOS 16.4 ships Safari 16.4.
const TARGET = 'safari16.4';
// In a script element, `<!--` followed by `<script` switches the HTML parser into a state where
// `</script>` no longer ends the element. Rewriting either sequence would change what a regular
// expression or String.raw in the bundle means, so a bundle that contains one is refused.
const UNEMBEDDABLE = /<!--|<script/i;

// The entry esbuild bundles: Strudel's functions handed to the page's bootstrap.
const ENTRY = `import { getAudioContext, initAudio, initStrudel, samples } from '@strudel/web';
import { startPage } from ${JSON.stringify(join(PAGE_DIR, 'player.js'))};
void startPage(window, { getAudioContext, initAudio, initStrudel, samples });
`;
// The entry of the script the WebView runs before content in every frame (FRAME_GUARD_SCRIPT):
// the page's own guards, so the two cannot drift. Whether WKWebView runs it in a frame a script
// creates is on the device checklist.
const FRAME_ENTRY = `import { silenceDialogs } from ${JSON.stringify(join(PAGE_DIR, 'dialogs.js'))};
import { blockWebRtc } from ${JSON.stringify(join(PAGE_DIR, 'webrtc.js'))};
silenceDialogs(window);
blockWebRtc(window);
`;

/** Thrown for a failure with its own message, printed as is. */
class BuildError extends Error {}

/** Writes one line to stderr, prefixed with the script's name. */
function say(line) {
  process.stderr.write(`build-strudel: ${line}\n`);
}

/**
 * Makes the bundle safe inside a script element. `</script` would end the element early, so it
 * becomes `<\/script`, which means the same in a JavaScript string, template or regular
 * expression (in a `u` or `v` regular expression too); only String.raw would see the backslash.
 * A bundle with `<!--` or `<script` is refused, and the result must parse as a classic script:
 * `new vm.Script` compiles it without running it.
 * @param {string} js
 */
function embeddable(js) {
  if (UNEMBEDDABLE.test(js)) {
    throw new BuildError(
      'the bundle contains a sequence that cannot be embedded in a script element',
    );
  }
  const escaped = js.replace(/<\/(script)/gi, '<\\/$1');
  try {
    new vm.Script(escaped);
  } catch (error) {
    throw new BuildError(`the bundled script does not parse: ${describe(error)}`);
  }
  return escaped;
}

/**
 * Puts the bundle into the page template in place of its placeholder.
 * @param {string} template
 * @param {string} js
 */
export function renderHtml(template, js) {
  const parts = template.split(PLACEHOLDER);
  if (parts.length !== 2) throw new BuildError(`the template needs one ${PLACEHOLDER}`);
  return parts.join(embeddable(js));
}

/**
 * A string literal that nothing in `text` can end early; U+2028 and U+2029 are escaped as well, so
 * the file reads the same in any tool.
 * @param {string} text
 */
function literal(text) {
  return JSON.stringify(text).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

/**
 * The generated TypeScript module.
 * @param {{ html: string, frameScript: string, version: string, license: string }} page
 */
export function renderModule({ html, frameScript, version, license }) {
  const hash = createHash('sha256').update(html).digest('hex').slice(0, 8);
  return `// Generated by apps/mobile/scripts/build-strudel.mjs. Do not edit: run \`${COMMAND}\`.
// It bundles @strudel/web ${version}, licensed ${license}. A distribution build that includes it
// is made only once its exact source is published under its tag (docs/standards.md, REPO-7).

export const STRUDEL_BUNDLE_VERSION: string = ${JSON.stringify(`${version}-${hash}`)};
export const STRUDEL_HTML: string = ${literal(html)};
export const FRAME_GUARD_SCRIPT: string = ${literal(frameScript)};
`;
}

const NOT_FOUND_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/**
 * The path `find` returns, or undefined when the module is not installed. Any other error, such
 * as a corrupt package.json, is thrown, so it fails the build instead of passing for a skip.
 * @param {() => string} find
 */
function tryResolve(find) {
  try {
    return find();
  } catch (error) {
    if (NOT_FOUND_CODES.has(error?.code)) return undefined;
    throw error;
  }
}

/**
 * Finds esbuild and @strudel/web. Returns null when the build should be skipped.
 * @param {{ resolveFrom: string, postinstall: boolean }} options
 */
function resolveTools({ resolveFrom, postinstall }) {
  const require = createRequire(join(resolveFrom, 'package.json'));
  // Literal names in require.resolve calls, so knip sees both packages used.
  const strudel = tryResolve(() => require.resolve('@strudel/web/package.json'));
  const esbuild = tryResolve(() => require.resolve('esbuild'));
  if (!strudel && !esbuild && postinstall) {
    say('Strudel bundle not built: esbuild and @strudel/web are not installed');
    return null;
  }
  for (const [name, path] of [
    ['@strudel/web', strudel],
    ['esbuild', esbuild],
  ]) {
    if (!path) throw new BuildError(`${name} not found; run pnpm install`);
  }
  return { strudel: String(strudel), esbuild: String(esbuild) };
}

/** The esbuild options both bundles share: deterministic, no source map, no absolute paths. */
const BUILD_OPTIONS = {
  absWorkingDir: PACKAGE_DIR,
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: [TARGET],
  minify: true,
  charset: 'ascii',
  sourcemap: false,
  logLevel: 'silent',
};

/**
 * Bundles the page's script. Deterministic: the same inputs give the same bytes. The script
 * starts with @strudel/web's license notice, and any license comment in the sources stays in the
 * bundle, as the library's license requires.
 * @param {typeof import('esbuild')} esbuild
 * @param {{ resolveFrom: string, entry: string | undefined }} options
 * @param {{ version: string, license: string, homepage: string }} pkg @strudel/web's package.json
 */
async function bundle(esbuild, { resolveFrom, entry }, pkg) {
  const home = pkg.homepage.split('#')[0];
  const input = entry
    ? { entryPoints: [entry] }
    : {
        stdin: {
          contents: ENTRY,
          resolveDir: resolveFrom,
          sourcefile: 'strudel-page.js',
          loader: 'js',
        },
      };
  const result = await esbuild.build({
    banner: { js: `/*! @strudel/web ${pkg.version} | ${pkg.license} | ${home} */` },
    ...input,
    ...BUILD_OPTIONS,
    legalComments: 'inline',
  });
  for (const warning of result.warnings) say(`warning: ${warning.text}`);
  return result.outputFiles[0].text;
}

/**
 * Bundles the frame guard script (FRAME_ENTRY). It must parse as a classic
 * script, and it ends with `true;`, as react-native-webview asks of an injected script.
 * @param {typeof import('esbuild')} esbuild
 */
async function bundleFrameScript(esbuild) {
  const stdin = { contents: FRAME_ENTRY, resolveDir: PAGE_DIR, sourcefile: 'frame-guard.js' };
  const result = await esbuild.build({ stdin, ...BUILD_OPTIONS });
  const script = `${result.outputFiles[0].text}true;`;
  try {
    new vm.Script(script);
  } catch (error) {
    throw new BuildError(`the frame guard script does not parse: ${describe(error)}`);
  }
  return script;
}

/** Writes to a temporary file in the same folder, then renames it; a failure leaves nothing. */
async function writeAtomically(out, text) {
  await mkdir(dirname(out), { recursive: true });
  const temporary = `${out}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, text);
    await rename(temporary, out);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: DEFAULT_OUT },
      'resolve-from': { type: 'string', default: PACKAGE_DIR },
      entry: { type: 'string' },
      postinstall: { type: 'boolean', default: false },
    },
  });
  return {
    out: values.out,
    resolveFrom: values['resolve-from'],
    entry: values.entry,
    postinstall: values.postinstall,
  };
}

/** Runs the build. Returns the exit code. */
async function main(argv) {
  let step = 'arguments';
  try {
    const options = parseOptions(argv);
    step = 'resolve';
    const tools = resolveTools(options);
    if (tools === null) return 0;
    const pkg = JSON.parse(await readFile(tools.strudel, 'utf8'));
    step = 'bundle';
    const { default: esbuild } = await import(pathToFileURL(tools.esbuild).href);
    const js = await bundle(esbuild, options, pkg);
    const frameScript = await bundleFrameScript(esbuild);
    step = 'render';
    const html = renderHtml(await readFile(join(PAGE_DIR, 'index.html'), 'utf8'), js);
    step = 'write';
    await writeAtomically(
      options.out,
      renderModule({ html, frameScript, version: pkg.version, license: pkg.license }),
    );
    return 0;
  } catch (error) {
    say(error instanceof BuildError ? error.message : `${step} failed: ${describe(error)}`);
    return 1;
  }
}

/** One line about an unexpected error: esbuild's first error, or the message's first line. */
function describe(error) {
  const first = error?.errors?.[0]?.text;
  const message = error instanceof Error ? error.message : String(error);
  return (first ?? message).split('\n')[0];
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
