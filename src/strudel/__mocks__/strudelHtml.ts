// Stands in for the generated module (`src/strudel/generated/strudelHtml`) in tests. The real
// module is written by the build script into `src/strudel/generated/`, which is git-ignored and
// does not exist on a fresh clone or in CI, so `apps/mobile/jest.config.js` maps any import that
// resolves to that path to this stub instead.

export const STRUDEL_HTML: string = '<!doctype html><html><body></body></html>';
export const STRUDEL_BUNDLE_VERSION: string = 'test';
export const FRAME_GUARD_SCRIPT: string = 'true;';
