// Renders the app's store assets — the icon, the Android adaptive icon and the splash screen —
// from one inline SVG loop glyph, with sharp: `icon.png` (1024x1024, flattened, no alpha),
// `adaptive-icon.png` (1024x1024, the glyph on transparent) and `splash.png` (1284x2778, the
// background colour with the glyph centred). The colours are read from src/theme/index.ts (SS-1,
// docs/standards.md), the one home of design tokens, by transpiling it with esbuild and importing
// the result — the technique scripts/__tests__/build-strudel.test.mjs uses to import a generated
// TypeScript module.
//
// The mobile package's `make:assets` script runs it into apps/mobile/assets/. Options, for tests:
// --out-dir <dir> writes elsewhere.
import { Buffer } from 'node:buffer';
import { mkdir, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { transformSync } from 'esbuild';
import sharp from 'sharp';

const PACKAGE_DIR = dirname(import.meta.dirname);
const THEME_PATH = join(PACKAGE_DIR, 'src', 'theme', 'index.ts');
const DEFAULT_OUT_DIR = join(PACKAGE_DIR, 'assets');

const ICON_SIZE = 1024;
const SPLASH_SIZE = { width: 1284, height: 2778 };
const SPLASH_GLYPH_SIZE = 300;
const PNG_OPTIONS = { compressionLevel: 9 };

/** Thrown for a failure with its own message, printed as is. */
class BuildError extends Error {}

/** Writes one line to stderr, prefixed with the script's name. */
function say(line) {
  process.stderr.write(`make-assets: ${line}\n`);
}

/**
 * The theme's `colors` export (SS-1's one home of design tokens), read by transpiling
 * src/theme/index.ts with esbuild and importing the result as a data URL.
 */
async function readThemeColors() {
  const source = await readFile(THEME_PATH, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
  const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  return module.colors;
}

/**
 * An open arc of a ring: a circle of radius `r` centered at (`cx`, `cy`), as an SVG path's `d`,
 * drawn clockwise from `startDeg` to `endDeg` (0 at the top).
 */
function ringArc({ cx, cy, r, startDeg, endDeg }) {
  const point = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = point(startDeg);
  const [ex, ey] = point(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

/**
 * The loop glyph: two overlapping rounded arcs, in `accent`, centered in a `width`x`height` box.
 * With `background`, the box is filled with it; without one, the box stays transparent (the
 * adaptive icon's foreground layer). No text.
 */
export function loopGlyphSvg({ width, height, glyphSize, accent, background }) {
  const r = glyphSize * 0.26;
  const offset = r * 0.62;
  const stroke = glyphSize * 0.1;
  const cx = width / 2;
  const cy = height / 2;
  const left = ringArc({ cx: cx - offset, cy, r, startDeg: -40, endDeg: 220 });
  const right = ringArc({ cx: cx + offset, cy, r, startDeg: 140, endDeg: 400 });
  const fill = background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : '';
  const ring = (d) =>
    `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${fill}${ring(left)}${ring(right)}</svg>`
  );
}

/** Rasterizes an SVG string to a PNG file, compressed, optionally flattened onto `background`. */
async function renderPng(svg, outFile, background) {
  let image = sharp(Buffer.from(svg));
  if (background) image = image.flatten({ background });
  await image.png(PNG_OPTIONS).toFile(outFile);
}

async function renderIcon(colors, outDir) {
  const svg = loopGlyphSvg({
    width: ICON_SIZE,
    height: ICON_SIZE,
    glyphSize: ICON_SIZE * 0.6,
    accent: colors.lime,
    background: colors.paper,
  });
  await renderPng(svg, join(outDir, 'icon.png'), colors.paper);
}

async function renderAdaptiveIcon(colors, outDir) {
  const svg = loopGlyphSvg({
    width: ICON_SIZE,
    height: ICON_SIZE,
    glyphSize: ICON_SIZE * 0.5,
    accent: colors.lime,
  });
  await renderPng(svg, join(outDir, 'adaptive-icon.png'));
}

async function renderSplash(colors, outDir) {
  const svg = loopGlyphSvg({
    width: SPLASH_SIZE.width,
    height: SPLASH_SIZE.height,
    glyphSize: SPLASH_GLYPH_SIZE,
    accent: colors.lime,
    background: colors.paper,
  });
  await renderPng(svg, join(outDir, 'splash.png'), colors.paper);
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { 'out-dir': { type: 'string', default: DEFAULT_OUT_DIR } },
  });
  return { outDir: values['out-dir'] };
}

/** Runs the build. Returns the exit code. */
async function main(argv) {
  let step = 'arguments';
  try {
    const { outDir } = parseOptions(argv);
    step = 'theme';
    const colors = await readThemeColors();
    step = 'directory';
    await mkdir(outDir, { recursive: true });
    step = 'render';
    await renderIcon(colors, outDir);
    await renderAdaptiveIcon(colors, outDir);
    await renderSplash(colors, outDir);
    return 0;
  } catch (error) {
    say(error instanceof BuildError ? error.message : `${step} failed: ${describe(error)}`);
    return 1;
  }
}

/** One line about an unexpected error: the message's first line. */
function describe(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0];
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
