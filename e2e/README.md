# Simulator flows

Three [Maestro](https://maestro.dev) flows drive the app in the iOS simulator. They run on the
development build from `docs/device-builds.md` (route A) and load its JavaScript from the dev
server. `feed.yaml` and `keep-going.yaml` use the demo cards (the `fixture` data source); their
first recorded run is `docs/simulator-run-2026-09-28.md`. `signed-in-feed.yaml` uses the local
stack (the `api` data source); see [The signed-in flow](#the-signed-in-flow). Its first recorded
run is `docs/simulator-run-2026-09-30.md`.

| Flow                  | What it does                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feed.yaml`           | Answers the six cards of set 1 in order. Checks that the unanswered quiz card refuses a swipe and shows the gate toast. Plays the exercise and checks Stop replaces Play. Reaches the Summary and checks its title and streak. Taps each tab once. Takes a screenshot of each of these. |
| `keep-going.yaml`     | Answers set 1, then taps Keep going through sets 2, 3 and 4 into set 5. Checks the header's `SET n`, each set's first title, the streak, and that each Summary title counts the whole session.                                                                                          |
| `signed-in-feed.yaml` | Signs in a new throwaway user with the code from the local mail page, finds `strudel-demo` in Explore, starts it, answers the first set (concept, quiz, exercise) and checks the Summary. Takes seven screenshots.                                                                      |

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
   `xcrun simctl install <udid> <path to DoomSkill.app>`. The build is in Xcode's DerivedData,
   under `DoomSkill-*/Build/Products/Debug-iphonesimulator/`.
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

## The signed-in flow

`signed-in-feed.yaml` runs against the local stack: Supabase (auth, the database, the mail page
Mailpit on `http://127.0.0.1:54324`) and the API on port 8000. It needs no model key and no
worker: the topic it starts is `strudel-demo`, the demo cards written by a script. It never
touches the owner's `strudel` topic.

The flow types a new address, `e2e-<milliseconds>@example.test`, taps Send code, then reads the
code with an `evalScript` step: it asks Mailpit's API (`/api/v1/search`, then `/api/v1/message/<id>`)
for the one message sent to that address and takes the six digits from the email's code element.
No script file and no shell step are involved, and the code is never printed.

Run these from the repo root, in order. The keys are read into shell variables from
`supabase status` and never printed; no `.env` file is written.

1. The local stack must be running (`supabase status`). Read its keys and the API's settings:

   ```bash
   eval "$(env -i PATH="$PATH" HOME="$HOME" CI=true supabase status -o env 2>/dev/null | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=' | sed -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/' -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/')"
   export ENVIRONMENT=local SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   ```

2. Seed the demo topic. Exit 3 means it is already there, which is fine. `--replace` writes it
   again and removes every enrollment in it:

   ```bash
   (cd services/api && uv run python -m scripts.seed_demo_topic strudel-demo)
   ```

3. Build the app once, as route A in `docs/device-builds.md` says. A build made before the
   sign-in work (Expo SecureStore, AsyncStorage, notifications) lacks their native modules: delete
   `apps/mobile/ios/` first so it is generated again. `--no-bundler` leaves the dev server to
   step 5, which needs the variables:

   ```bash
   pnpm --filter mobile run build:strudel
   pnpm --filter mobile exec expo run:ios --no-bundler --device <udid>
   ```

4. Start the API (its own terminal, with step 1's variables):

   ```bash
   uv run --directory services/api uvicorn app.main:app --no-access-log --ws none --port 8000
   ```

5. Start the dev server with the `api` data source (its own terminal, with step 1's variables).
   `--clear` drops a bundle built with other values:

   ```bash
   EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" pnpm --filter mobile exec expo start --clear
   ```

6. Run the flow. It starts the app with its state and the simulator's keychain cleared, so it
   always starts signed out:

   ```bash
   maestro --device <udid> test --test-output-dir <folder> apps/mobile/e2e/signed-in-feed.yaml
   ```

7. Delete the throwaway users and their mail, whether the flow passed or not. Deleting a user
   deletes its enrollment in `strudel-demo`, its node states, attempts and feeds:

   ```bash
   for id in $(curl -s "http://127.0.0.1:54321/auth/v1/admin/users?per_page=1000" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq -r '.users[] | select(.email | test("^e2e-[0-9]+@example\\.test$")) | .id'); do
     curl -s -o /dev/null -w "DELETE user: %{http_code}\n" -X DELETE "http://127.0.0.1:54321/auth/v1/admin/users/$id" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   done
   curl -s -o /dev/null -w "DELETE mail: %{http_code}\n" -X DELETE "http://127.0.0.1:54324/api/v1/search?query=to:e2e-"
   ```

8. Stop the API and the dev server (Ctrl+C in their terminals).

`pnpm test:integration` skips the seed script's live test while `strudel-demo` exists, rather
than remove it.

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
- With the demo cards the app keeps no state between launches, so `feed.yaml` and
  `keep-going.yaml` start on set 1. `signed-in-feed.yaml` clears the app's state itself.
- These are simulator runs on the owner's Mac. Rule REPO-7 applies: a distribution build is given
  out only once the exact source it was built from is published under its tag
  (`docs/publishing.md`).
