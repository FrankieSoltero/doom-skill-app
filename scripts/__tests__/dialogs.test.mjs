// Tests for the page's guards against JavaScript dialogs and frames (src/strudel/page/player.js):
// learner code must not be able to put a native alert, confirm or prompt over the app.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { removeFrames, silenceDialogs, startPage } from '../../src/strudel/page/player.js';

const NAMES = ['alert', 'confirm', 'prompt', 'print'];

function dialogWindow() {
  const shown = [];
  const win = {};
  for (const name of NAMES) win[name] = (...args) => void shown.push([name, ...args]);
  return { win, shown };
}

test('the dialog stubs show nothing and return what a dismissed dialog would', () => {
  const { win, shown } = dialogWindow();
  silenceDialogs(win);
  assert.equal(win.alert('x'), undefined);
  assert.equal(win.confirm('x'), false);
  assert.equal(win.prompt('x', 'y'), null);
  assert.equal(win.print(), undefined);
  assert.deepEqual(shown, []);
});

test('the dialog stubs cannot be reassigned or deleted', () => {
  const { win } = dialogWindow();
  silenceDialogs(win);
  const stubs = NAMES.map((name) => win[name]);
  for (const name of NAMES) {
    assert.throws(() => {
      win[name] = () => 'hijacked';
    }, TypeError);
    assert.throws(() => delete win[name], TypeError);
    assert.throws(() => Object.defineProperty(win, name, { value: () => 'hijacked' }), TypeError);
  }
  assert.deepEqual(
    NAMES.map((name) => win[name]),
    stubs,
  );
  assert.equal(win.prompt('x'), null);
});

test('a dialog the engine will not let go of does not stop the others or the page', () => {
  const { win, shown } = dialogWindow();
  const locked = win.alert;
  Object.defineProperty(win, 'alert', { value: locked, writable: false, configurable: false });
  assert.doesNotThrow(() => silenceDialogs(win));
  assert.equal(win.alert, locked);
  assert.equal(win.prompt('x'), null);
  assert.deepEqual(shown, []);
});

function element(tag, children = []) {
  const node = { nodeType: 1, tag, removed: false, children };
  node.matches = (selector) => selector.split(', ').includes(tag);
  node.querySelectorAll = (selector) =>
    children.flatMap((child) => (child.matches(selector) ? [child] : []));
  node.remove = () => void (node.removed = true);
  return node;
}

class FakeObserver {
  static last;
  constructor(callback) {
    this.callback = callback;
    FakeObserver.last = this;
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
}

test('frames added anywhere in the document are removed', () => {
  // The document itself, not its root element: document.open() replaces the root element.
  const doc = { documentElement: {} };
  removeFrames(doc, FakeObserver);
  const observer = FakeObserver.last;
  assert.equal(observer.target, doc);
  assert.deepEqual(observer.options, { childList: true, subtree: true });
  const iframe = element('iframe');
  const nested = element('iframe');
  const div = element('div', [nested, element('span')]);
  const text = { nodeType: 3 };
  observer.callback([{ addedNodes: [iframe, div, text] }, { addedNodes: [element('embed')] }]);
  assert.ok(iframe.removed && nested.removed);
  assert.ok(!div.removed && !div.children[1].removed);
});

test('startPage installs the guards before Strudel starts and before it listens', async () => {
  const { win, shown } = dialogWindow();
  const order = [];
  const guarded = () => Object.getOwnPropertyDescriptor(win, 'alert')?.writable === false;
  Object.assign(win, {
    document: {
      documentElement: {},
      addEventListener: (type) => order.push([`document:${type}`, guarded()]),
    },
    MutationObserver: class {
      observe() {
        order.push(['observe', guarded()]);
      }
    },
    addEventListener: (type) => order.push([`window:${type}`, guarded()]),
    fetch: async () => ({ ok: true }),
  });
  const repl = { scheduler: { now: () => 0, cps: 0.5 } };
  const strudel = { initStrudel: async () => (order.push(['initStrudel', guarded()]), repl) };
  await startPage(win, strudel);
  assert.deepEqual(order, [
    ['observe', true],
    ['initStrudel', true],
    ['window:message', true],
    ['document:strudel.log', true],
  ]);
  win.alert('from learner code');
  assert.deepEqual(shown, []);
});
