// Tests for the page's WebRTC block (src/strudel/page/webrtc.js). The page's Content-Security-Policy
// does not govern WebRTC, so learner code could open a peer connection to any host. The page
// replaces the constructors, before any card code runs, with functions that throw.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { startPage } from '../../src/strudel/page/player.js';
import { WEBRTC_BLOCKED, blockWebRtc } from '../../src/strudel/page/webrtc.js';
import { snippetRepl } from './fakes.mjs';

const NAMES = ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel'];

/** A window whose WebRTC constructors count what they build. */
function rtcWindow() {
  const built = [];
  const win = {};
  for (const name of NAMES) {
    win[name] = class {
      constructor() {
        built.push(name);
      }
    };
  }
  return { win, built };
}

test('each WebRTC constructor throws, with or without new, and builds nothing', () => {
  const { win, built } = rtcWindow();
  blockWebRtc(win);
  for (const name of NAMES) {
    assert.throws(() => new win[name](), { message: WEBRTC_BLOCKED });
    assert.throws(() => win[name](), { message: WEBRTC_BLOCKED });
  }
  assert.deepEqual(built, []);
  assert.equal(WEBRTC_BLOCKED, 'WebRTC is not available');
});

test('the blocked constructors cannot be put back', () => {
  const { win } = rtcWindow();
  blockWebRtc(win);
  const stubs = NAMES.map((name) => win[name]);
  for (const name of NAMES) {
    assert.throws(() => {
      win[name] = class {};
    }, TypeError);
    assert.throws(() => delete win[name], TypeError);
    assert.throws(() => Object.defineProperty(win, name, { value: class {} }), TypeError);
  }
  assert.deepEqual(
    NAMES.map((name) => win[name]),
    stubs,
  );
});

test('a window without WebRTC gets the blocking stubs too', () => {
  const win = {};
  blockWebRtc(win);
  assert.throws(() => new win.RTCPeerConnection(), { message: WEBRTC_BLOCKED });
});

test('a constructor the engine will not let go of does not stop the others', () => {
  const { win, built } = rtcWindow();
  const locked = win.RTCPeerConnection;
  Object.defineProperty(win, 'RTCPeerConnection', { value: locked, configurable: false });
  assert.doesNotThrow(() => blockWebRtc(win));
  assert.throws(() => new win.RTCDataChannel(), { message: WEBRTC_BLOCKED });
  assert.deepEqual(built, []);
});

/** The page's window, with the WebRTC constructors, the bridge and the listeners startPage adds. */
function pageWindow() {
  const { win, built } = rtcWindow();
  const sent = [];
  const listeners = {};
  Object.assign(win, {
    document: { addEventListener: () => {} },
    MutationObserver: class {
      observe() {}
    },
    addEventListener: (type, listener) => void (listeners[type] = listener),
    fetch: async () => ({ ok: true }),
    ReactNativeWebView: { postMessage: (raw) => sent.push(JSON.parse(raw)) },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  return { win, built, sent, listeners };
}

test('Page: a snippet calling new RTCPeerConnection() reports an error and opens nothing', async () => {
  const { win, built, sent, listeners } = pageWindow();
  const strudel = {
    initStrudel: async ({ onEvalError }) => snippetRepl(win, onEvalError),
    initAudio: async () => {},
    samples: async () => {},
  };
  await startPage(win, strudel);
  for (const code of ['new RTCPeerConnection()', 'new webkitRTCPeerConnection()']) {
    await listeners.message({ data: JSON.stringify({ type: 'load', code }) });
  }
  assert.deepEqual(sent, [
    { type: 'ready' },
    { type: 'error', message: WEBRTC_BLOCKED },
    { type: 'error', message: WEBRTC_BLOCKED },
  ]);
  assert.deepEqual(built, []);
});

test('startPage blocks WebRTC before Strudel starts', async () => {
  const { win } = pageWindow();
  let blockedAtStart;
  const strudel = {
    initStrudel: async ({ onEvalError }) => {
      blockedAtStart =
        Object.getOwnPropertyDescriptor(win, 'RTCPeerConnection')?.writable === false;
      return snippetRepl(win, onEvalError);
    },
  };
  await startPage(win, strudel);
  assert.equal(blockedAtStart, true);
});
