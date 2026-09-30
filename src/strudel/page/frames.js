// Keeps learner code from reaching a frame's window. player.js calls closeFrameAccess and
// removeFrames on the page's window before Strudel starts, so before any card code runs;
// scripts/__tests__/frames.test.mjs and dialogs.test.mjs test them under Node.
//
// A frame a snippet creates has a fresh window with the native WebRTC constructors and the native
// dialogs, which the page's own guards (webrtc.js, dialogs.js) do not reach. The page removes
// every frame added to the document (removeFrames), but that is not enough on its own:
// - a mutation observer does not see into shadow roots, and neither does querySelectorAll, so a
//   frame inside a shadow root is never removed;
// - the observer runs after the snippet's synchronous code, so a plain frame's window is live and
//   readable until then.
// So the page also refuses every way a snippet can make a shadow root (attachShadow, and the
// declarative `<template shadowrootmode>` through setHTMLUnsafe, parseHTMLUnsafe or
// document.write), and makes `contentWindow` and `contentDocument` null on every frame element.
// What is left, a frame's window reached as `window[0]` or `frames[0]` during the snippet's
// synchronous code, cannot be closed from the page (a window's indexed properties cannot be
// redefined): the WebView's script, run before content in every frame (FRAME_GUARD_SCRIPT), covers it,
// and the server refuses card code that indexes the window (`unsafe_code` in
// services/api/app/llm/card_checks.py).

import { silenceDialogs } from './dialogs.js';
import { blockWebRtc } from './webrtc.js';

/** The error every refused way to a shadow root throws; the page posts it like any other. */
export const FRAMES_BLOCKED = 'Frames and shadow roots are not available';

/** Each interface, whether its members are on its prototype or on itself, and their names. */
const REFUSED = [
  { name: 'Element', onPrototype: true, members: ['attachShadow', 'setHTMLUnsafe'] },
  { name: 'ShadowRoot', onPrototype: true, members: ['setHTMLUnsafe'] },
  { name: 'Document', onPrototype: true, members: ['write', 'writeln'] },
  { name: 'Document', onPrototype: false, members: ['parseHTMLUnsafe'] },
];
const FRAME_ELEMENTS = ['HTMLIFrameElement', 'HTMLFrameElement', 'HTMLObjectElement'];
const FRAME_WINDOW = ['contentWindow', 'contentDocument'];
const FRAME_SELECTOR = 'iframe, frame, object, embed';
const ELEMENT_NODE = 1;

/** Throws, called with or without `new`. */
function refuse() {
  throw new Error(FRAMES_BLOCKED);
}

/** A frame's window and document, as the page's code sees them: none. */
function none() {
  return null;
}

/**
 * Defines `name` on `target` as `descriptor`, not configurable, when `target` has it (its own or
 * inherited). A member the engine will not let go of is left as it is, and the page still starts.
 * @param {object} target
 * @param {string} name
 * @param {PropertyDescriptor} descriptor
 */
function replace(target, name, descriptor) {
  if (!(name in target)) return;
  try {
    Object.defineProperty(target, name, { ...descriptor, configurable: false });
  } catch {
    // Left as it is; the others are still replaced.
  }
}

/**
 * Replaces, on the window's DOM interfaces, every way to make a shadow root with a function that
 * throws, read-only and not configurable, and makes each frame element's `contentWindow` and
 * `contentDocument` getters answer null. An interface or a member the window lacks is skipped.
 * @param {object} win
 */
export function closeFrameAccess(win) {
  for (const { name, onPrototype, members } of REFUSED) {
    const target = onPrototype ? win[name]?.prototype : win[name];
    if (target === undefined) continue;
    for (const member of members) replace(target, member, { value: refuse, writable: false });
  }
  for (const name of FRAME_ELEMENTS) {
    const prototype = win[name]?.prototype;
    if (prototype === undefined) continue;
    for (const member of FRAME_WINDOW) replace(prototype, member, { get: none });
  }
}

/**
 * Silences a frame's own window and blocks its WebRTC, then takes the frame out. A window that
 * cannot be read (another origin, or none once closeFrameAccess has run) is left alone; the frame
 * is removed all the same.
 * @param {Element & { contentWindow?: object | null }} frame
 */
function removeFrame(frame) {
  try {
    const win = frame.contentWindow;
    if (win) {
      silenceDialogs(win);
      blockWebRtc(win);
    }
  } catch {
    // Not readable from here: nothing in it can be changed, and it is removed below.
  }
  frame.remove();
}

/**
 * Removes every frame added to the document from now on; the page has no use for frames. Each
 * frame's window is silenced first (removeFrame). It observes the document itself, not its root
 * element, which `document.open()` replaces.
 * @param {Node} doc
 * @param {typeof MutationObserver} Observer
 */
export function removeFrames(doc, Observer) {
  /** @param {Node} node */
  const sweep = (node) => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = /** @type {Element} */ (node);
    if (element.matches(FRAME_SELECTOR)) removeFrame(element);
    else for (const frame of element.querySelectorAll(FRAME_SELECTOR)) removeFrame(frame);
  };
  const observer = new Observer((records) => {
    for (const record of records) record.addedNodes.forEach(sweep);
  });
  observer.observe(doc, { childList: true, subtree: true });
}
