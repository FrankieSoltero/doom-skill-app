// Tests for scripts/make-assets.mjs: the three PNGs it renders, their dimensions, the icon's
// lack of an alpha channel, and the glyph helper. Every run writes into a temporary folder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import sharp from 'sharp';

import { loopGlyphSvg } from '../make-assets.mjs';

const MOBILE = join(import.meta.dirname, '..', '..');
const SCRIPT = join(MOBILE, 'scripts', 'make-assets.mjs');

const work = mkdtempSync(join(tmpdir(), 'make-assets-test-'));
after(() => rmSync(work, { recursive: true, force: true }));

let result;
before(() => {
  result = spawnSync(process.execPath, [SCRIPT, '--out-dir', work], { encoding: 'utf8' });
});

test('runs silently and writes the three files', () => {
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('icon.png is 1024x1024 with no alpha channel', async () => {
  const metadata = await sharp(join(work, 'icon.png')).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, false);
  assert.equal(metadata.format, 'png');
});

test('adaptive-icon.png is 1024x1024 with the glyph on transparent', async () => {
  const metadata = await sharp(join(work, 'adaptive-icon.png')).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, true);
});

test('splash.png is 1284x2778', async () => {
  const metadata = await sharp(join(work, 'splash.png')).metadata();
  assert.equal(metadata.width, 1284);
  assert.equal(metadata.height, 2778);
  assert.equal(metadata.hasAlpha, false);
});

test('the glyph is two overlapping arcs, not text, and respects transparency', () => {
  const accent = 'token-accent';
  const background = 'token-background';
  const onBackground = loopGlyphSvg({ width: 100, height: 100, glyphSize: 60, accent, background });
  assert.match(onBackground, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal(onBackground.match(/<path /g)?.length, 2);
  assert.ok(onBackground.includes(`<rect width="100" height="100" fill="${background}"/>`));
  assert.doesNotMatch(onBackground, /<text/);

  const transparent = loopGlyphSvg({ width: 100, height: 100, glyphSize: 60, accent });
  assert.ok(!transparent.includes('<rect'));
  assert.equal(transparent.match(/<path /g)?.length, 2);
});

test('an unknown option fails in one line', () => {
  const bad = spawnSync(process.execPath, [SCRIPT, '--outdirr', work], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^make-assets: arguments failed: [^\n]+\n$/);
});
