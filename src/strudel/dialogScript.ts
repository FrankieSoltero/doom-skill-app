// The script the WebView runs before any of the page's content, in the page's window and in each
// frame's (StrudelPlayer.tsx sets `injectedJavaScriptBeforeContentLoaded` with
// `injectedJavaScriptBeforeContentLoadedForMainFrameOnly` false).
//
// react-native-webview 13.16.1 shows `alert`, `confirm` and `prompt` as native alerts over the
// app, with text the page chooses, and has no prop to turn that off (no `onJsAlert`,
// `onJsConfirm` or `onJsPrompt` on iOS in this version; checked in its `WebViewTypes.d.ts`). The
// page runs code from card data, so each dialog, and `print`, is replaced with a stub that shows
// nothing and answers what a dismissed dialog answers, read-only and not configurable, before the
// page's own script starts. The page's script does the same again (`silenceDialogs` in
// page/player.js), and silences each frame it removes. A dialog the engine will not let go of is
// left as it is, so the page still starts.
//
// Plain ES5 in a string: the WebView runs it as is, with no build step.

/** Replaces the window's dialogs with silent stubs. Ends with `true`, as the library asks. */
export const SILENCE_DIALOGS_SCRIPT = `(function (w) {
  var stubs = {
    alert: function () { return undefined; },
    confirm: function () { return false; },
    prompt: function () { return null; },
    print: function () { return undefined; }
  };
  Object.keys(stubs).forEach(function (name) {
    try {
      Object.defineProperty(w, name, { value: stubs[name], writable: false, configurable: false });
    } catch (e) {}
  });
})(window);
true;`;
