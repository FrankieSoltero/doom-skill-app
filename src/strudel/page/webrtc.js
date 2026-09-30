// Blocks WebRTC in the page. player.js calls it on the page's window before Strudel starts, so
// before any card code runs, and on each frame's window as it removes the frame;
// scripts/__tests__/webrtc.test.mjs tests it under Node.
//
// The page's Content-Security-Policy (index.html) limits fetches to raw.githubusercontent.com, but
// CSP does not govern WebRTC: code from card data could open a peer connection or a data channel
// to any host. The page has no use for either.

/** The error a blocked WebRTC constructor throws; the page posts it like any other error. */
export const WEBRTC_BLOCKED = 'WebRTC is not available';

const NAMES = ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel'];

/** Throws, called with or without `new`. */
function blocked() {
  throw new Error(WEBRTC_BLOCKED);
}

/**
 * Replaces the window's WebRTC constructors with a function that throws, read-only and not
 * configurable, so a snippet cannot assign them back. It defines them on a window that lacks them
 * too. A constructor the engine will not let go of is left as it is, and the page still starts.
 * @param {object} win
 */
export function blockWebRtc(win) {
  for (const name of NAMES) {
    try {
      Object.defineProperty(win, name, { value: blocked, writable: false, configurable: false });
    } catch {
      // Left as it is; the others are still replaced.
    }
  }
}
