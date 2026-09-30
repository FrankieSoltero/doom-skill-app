// Silences the JavaScript dialogs of a window. Learner code runs in the page, and
// react-native-webview 13.16.1 shows `alert`, `confirm` and `prompt` as native alerts over the app
// (RNCWebViewImpl.m), with page-controlled text; no prop turns that off.
//
// It is built into two places from this one source: the page (player.js calls it on the page's
// window before Strudel starts, and frames.js on each frame's window as it removes the frame), and
// the script the WebView runs before any content in every frame (FRAME_GUARD_SCRIPT, which
// scripts/build-strudel.mjs bundles into the generated module with webrtc.js).

const DIALOGS = {
  alert: () => undefined,
  confirm: () => false,
  prompt: () => null,
  print: () => undefined,
};

/**
 * Replaces the window's dialogs, and `print`, with functions that show nothing and return what a
 * dismissed dialog returns. They are read-only and non-configurable, so a snippet cannot assign
 * them back.
 * @param {object} win
 */
export function silenceDialogs(win) {
  for (const [name, value] of Object.entries(DIALOGS)) {
    try {
      Object.defineProperty(win, name, { value, writable: false, configurable: false });
    } catch {
      // The engine will not let this one be replaced. The page must still start and post ready,
      // so it goes on; the device checklist covers each dialog.
    }
  }
}
