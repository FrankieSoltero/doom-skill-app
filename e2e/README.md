# Simulator flows

Two [Maestro](https://maestro.dev) flows drive the app in the iOS simulator. They run on the
development build from `docs/device-builds.md` (route A) and load its JavaScript from the dev
server. The first recorded run is `docs/simulator-run-2026-09-28.md`.

| Flow              | What it does                                                                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feed.yaml`       | Answers the six cards of set 1 in order. Checks that the unanswered quiz card refuses a swipe and shows the gate toast. Plays the exercise and checks Stop replaces Play. Reaches the Summary and checks its title and streak. Taps each tab once. Takes a screenshot of each of these. |
| `keep-going.yaml` | Answers set 1, then taps Keep going through sets 2, 3 and 4 into set 5. Checks the header's `SET n`, each set's first title, the streak, and that each Summary title counts the whole session.                                                                                          |

Shared steps live in `subflows/`: `launch.yaml` starts the app and connects it to the dev
server, `answer-set.yaml` answers one set (its parameters are listed at its top), and
`replace-code.yaml` replaces an editor's code and checks the editor holds exactly that code.

## What it needs

- Xcode and an iPhone simulator. No Apple account.
- Maestro, a tool on the Mac, not a repo dependency. Its Homebrew formula brings a Java runtime.
  Homebrew 7 refuses a formula from an untrusted tap, and a plain `brew install maestro` then
  installs an unrelated cask of the same name, so name the formula in full:

  ```bash
  brew tap mobile-dev-inc/tap
  brew trust --formula mobile-dev-inc/tap/maestro
  brew install --formula mobile-dev-inc/tap/maestro
  ```

- The development build installed on the simulator you run on, and the dev server on port 8081.

## Run

1. Build the app once (route A in `docs/device-builds.md`), or install an existing build:
   `xcrun simctl install <udid> <path to LearnLoop.app>`. The build is in Xcode's DerivedData,
   under `LearnLoop-*/Build/Products/Debug-iphonesimulator/`.
2. Start the dev server if it is not running: `pnpm --filter mobile start`.
3. Pick a booted simulator's UDID (`xcrun simctl list devices booted`). Use one nobody is using:
   the flows relaunch the app.
4. Run each flow from the repo root:

   ```bash
   maestro --device <udid> test --test-output-dir <folder> apps/mobile/e2e/feed.yaml
   maestro --device <udid> test --test-output-dir <folder> apps/mobile/e2e/keep-going.yaml
   ```

   Screenshots are written under `<folder>`, in a `takeScreenshot` folder. Keep `<folder>`
   outside the repo, and copy the screenshots you want into the run's record.

## Notes

- A build's first launch shows Expo's developer menu introduction. `launch.yaml` dismisses it
  when it shows, and waits a few seconds for it on every run.
- Expo's floating Tools button sits over the streak chip. For clean screenshots, turn it off
  once per simulator: open the developer menu (the gear button), then turn off Tools button.
  The setting survives relaunches, not a reinstall. The flows do not depend on it.
- The flows type code with the simulator's hardware keyboard. They check the editor's text
  after typing, so smart punctuation or autocorrect would fail the flow, not pass silently.
- The flows check that audio plays (Stop in place of Play). They do not judge the sound. The
  beat grid is one image to a screen reader, so its playhead is not in the accessibility tree;
  `feed.yaml` takes two pictures of the grid a moment apart instead.
- The app keeps no state between launches, so each flow starts on set 1.
- These are simulator runs on the owner's Mac. Rule REPO-7 applies: no build goes to anyone else.
