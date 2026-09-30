// The script the WebView runs in the page's window, and in each frame's, before any content: it
// replaces the JavaScript dialogs, which react-native-webview 13.16.1 would show as native alerts
// over the app, with stubs that show nothing. It runs here in a Node context with a stand-in window.
import { SILENCE_DIALOGS_SCRIPT } from '../dialogScript';

/** The one function of Node's `vm` module this test needs; the app's types do not include Node. */
type Vm = { runInNewContext: (code: string, context: object) => unknown };
const vm = jest.requireActual<Vm>('node:vm');

const NAMES = ['alert', 'confirm', 'prompt', 'print'] as const;

type DialogWindow = Record<(typeof NAMES)[number], (...args: unknown[]) => unknown>;

/** A window whose dialogs record each call, and the script's result when run in it. */
function runInWindow(prepare: (win: DialogWindow) => void = () => undefined) {
  const shown: unknown[][] = [];
  const win = Object.fromEntries(
    NAMES.map((name) => [name, (...args: unknown[]) => void shown.push([name, ...args])]),
  ) as DialogWindow;
  prepare(win);
  const result = vm.runInNewContext(SILENCE_DIALOGS_SCRIPT, { window: win });
  return { win, shown, result };
}

describe('SILENCE_DIALOGS_SCRIPT', () => {
  it('replaces every dialog with a stub that shows nothing and answers as dismissed', () => {
    const { win, shown, result } = runInWindow();

    expect([win.alert('x'), win.confirm('x'), win.prompt('x', 'y'), win.print()]).toStrictEqual([
      undefined,
      false,
      null,
      undefined,
    ]);
    expect(shown).toStrictEqual([]);
    expect(result).toBe(true);
  });

  it('makes the stubs read-only and not configurable', () => {
    const { win } = runInWindow();

    for (const name of NAMES) {
      expect(Object.getOwnPropertyDescriptor(win, name)).toMatchObject({
        writable: false,
        configurable: false,
      });
    }
  });

  it('goes on past a dialog the engine will not let go of', () => {
    const locked = () => 'locked';
    const { win, shown } = runInWindow((target) => {
      Object.defineProperty(target, 'alert', {
        value: locked,
        writable: false,
        configurable: false,
      });
    });

    expect(win.alert).toBe(locked);
    expect(win.confirm('x')).toBe(false);
    expect(shown).toStrictEqual([]);
  });
});
