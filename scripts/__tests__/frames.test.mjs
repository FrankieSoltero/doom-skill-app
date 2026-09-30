// Tests for the page's guard on frames (closeFrameAccess in src/strudel/page/frames.js). A frame's
// window has its own native WebRTC constructors and dialogs. The page removes each frame it sees,
// but a frame inside a shadow root is invisible to its observer, and a plain frame is live during
// the snippet's synchronous code. So the page refuses shadow roots and hides every frame's window.
// The window here is a small fake DOM with the same prototypes a browser has; each frame's window
// holds "native" constructors that record any use.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRAMES_BLOCKED, closeFrameAccess } from '../../src/strudel/page/frames.js';
import { startPage } from '../../src/strudel/page/player.js';
import { snippetRepl } from './fakes.mjs';

/** A window with a DOM whose frames each hold a window with native WebRTC and dialogs. */
function domWindow() {
  const used = [];
  const frameWindow = () => ({
    RTCPeerConnection: class {
      constructor() {
        used.push('RTCPeerConnection');
      }
    },
    alert: () => void used.push('alert'),
  });
  class Node {
    appendChild(child) {
      return child;
    }
  }
  class ShadowRoot extends Node {}
  class Element extends Node {
    attachShadow() {
      return new ShadowRoot();
    }
    setHTMLUnsafe() {}
  }
  class HTMLIFrameElement extends Element {
    #win = frameWindow();
    get contentWindow() {
      return this.#win;
    }
    get contentDocument() {
      return { defaultView: this.#win };
    }
  }
  class Document extends Node {
    body = new Element();
    createElement(tag) {
      return tag === 'iframe' ? new HTMLIFrameElement() : new Element();
    }
    write() {}
    writeln() {}
    addEventListener() {}
    static parseHTMLUnsafe() {
      return new Document();
    }
  }
  const win = { Node, Element, ShadowRoot, HTMLIFrameElement, Document };
  Object.assign(win, {
    document: new Document(),
    MutationObserver: class {
      observe() {}
    },
    addEventListener: () => {},
    fetch: async () => ({ ok: true }),
  });
  return { win, used };
}

/** The page started on `win`, with the snippets it loads run in `win`, and what it posted. */
async function page(win) {
  const sent = [];
  let guardedAtStart;
  win.ReactNativeWebView = { postMessage: (raw) => sent.push(JSON.parse(raw)) };
  let onMessage;
  win.addEventListener = (type, listener) => void (onMessage = listener);
  const strudel = {
    initStrudel: async ({ onEvalError }) => {
      const { prototype } = win.HTMLIFrameElement;
      guardedAtStart =
        Object.getOwnPropertyDescriptor(prototype, 'contentWindow').configurable === false &&
        Object.getOwnPropertyDescriptor(win.Element.prototype, 'attachShadow').writable === false;
      return snippetRepl(win, onEvalError);
    },
  };
  await startPage(win, strudel);
  const load = (code) => onMessage({ data: JSON.stringify({ type: 'load', code }) });
  return { sent, load, guardedAtStart: () => guardedAtStart };
}

test("Page: the reviewer's frame in a closed shadow root is refused, and nothing native is reached", async () => {
  const { win, used } = domWindow();
  const { sent, load } = await page(win);
  await load(
    "const h=document.createElement('div'); const f=document.createElement('iframe'); " +
      "h.attachShadow({mode:'closed'}).appendChild(f); document.body.appendChild(h); " +
      'globalThis.leak = [f.contentWindow, f.contentDocument];',
  );
  assert.deepEqual(sent, [{ type: 'ready' }, { type: 'error', message: FRAMES_BLOCKED }]);
  assert.equal(win.leak, undefined);
  assert.deepEqual(used, []);
});

test('Page: a frame appended and read in the same tick exposes no window', async () => {
  const { win, used } = domWindow();
  const { sent, load, guardedAtStart } = await page(win);
  await load(
    "const f=document.createElement('iframe'); document.body.appendChild(f); " +
      "const getter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');" +
      'globalThis.leak = [f.contentWindow, f.contentDocument, getter.get.call(f)];',
  );
  assert.deepEqual([...win.leak], [null, null, null]);
  assert.deepEqual(sent, [{ type: 'ready' }]);
  assert.deepEqual(used, []);
  assert.equal(guardedAtStart(), true, 'in place before Strudel starts');
});

test('every other way to a shadow root throws', async () => {
  const { win } = domWindow();
  const { load } = await page(win);
  await load(
    'globalThis.routes = [' +
      "() => document.body.setHTMLUnsafe('<template shadowrootmode=open></template>'), " +
      "() => Document.parseHTMLUnsafe('<template shadowrootmode=open></template>'), " +
      "() => document.write('<template shadowrootmode=open></template>'), " +
      "() => document.writeln('<template shadowrootmode=open></template>')]" +
      '.map((make) => { try { make(); return "made"; } catch (error) { return error.message; } });',
  );
  assert.deepEqual([...win.routes], Array(4).fill(FRAMES_BLOCKED));
});

test('the stubs cannot be put back', () => {
  const { win } = domWindow();
  closeFrameAccess(win);
  const { Element, HTMLIFrameElement, Document } = win;
  const stub = Element.prototype.attachShadow;
  assert.throws(() => {
    Element.prototype.attachShadow = () => 'hijacked';
  }, TypeError);
  assert.throws(() => delete Element.prototype.attachShadow, TypeError);
  assert.throws(
    () => Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get: () => 1 }),
    TypeError,
  );
  assert.throws(() => Object.defineProperty(Document, 'parseHTMLUnsafe', { value: 1 }), TypeError);
  assert.equal(Element.prototype.attachShadow, stub);
  assert.throws(() => new Element().attachShadow({ mode: 'open' }), { message: FRAMES_BLOCKED });
});

test('a window without these interfaces or members is left as it is', () => {
  const bare = {};
  assert.doesNotThrow(() => closeFrameAccess(bare));
  assert.deepEqual(Object.keys(bare), []);
  class Element {}
  class Document {}
  const partial = { Element, Document };
  closeFrameAccess(partial);
  assert.equal(Object.hasOwn(Element.prototype, 'setHTMLUnsafe'), false);
  assert.equal(Object.hasOwn(Document, 'parseHTMLUnsafe'), false);
});
