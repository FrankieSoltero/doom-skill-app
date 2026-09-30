# Demo card fixtures

The app shows these cards until the backend exists. When it does, generated cards replace all
of them. Only `src/data/` reads these files (rule SS-6), through `createFixtureSource()` in
`../fixtureSource.ts`. The source serves set 1, 2, 3, 4, then set 1 again, without end.

- `cards.fixture.json` holds set 1, from the design handoff (`docs/design/card-feed/`). It also
  holds the topic every set shares and the topic `tree`, whose node names the cards use.
- `cards.extra.fixture.json` holds sets 2 to 4. An AI model wrote them for the demo on
  2026-09-28. Every fact and code snippet in them was checked against Strudel's documentation
  (https://strudel.cc/learn/) and by running it in Strudel's own evaluator, @strudel/web 1.3.0
  (`apps/mobile/scripts/__tests__/demoContent.eval.test.mjs`). No person has reviewed them for
  teaching quality.

`feed_response.json` is not demo data. It is a copy of the API's `GET /feed/today` response from
the API's tests (`services/api/tests/fixtures/feed_response.json`), a set with all six card
types, in the API's snake_case. `../__tests__/apiContract.test.ts` holds it to the app's card
schema, and `services/api/tests/test_feed_fixture_sync.py` fails when the two copies differ.

## Shape of `cards.extra.fixture.json`

`{ "sets": [ { "cards": [...], "summary": {...} }, ... ] }`, one entry per set, in serving
order. Each entry is a `FeedSet` (`../schema.ts`) without `topic` and `setNumber`: the source
adds the topic from `cards.fixture.json` and the set number, then validates the set with
`feedSetSchema`.

The stated solutions to the exercises and checkpoints are not here, so the app cannot show them.
They live with the tests, in `apps/mobile/scripts/__tests__/fixtures/demoSolutions.json`.

## Checkpoint feedback copy

The checkpoint feedback is copy in `src/copy/` (`copy.checkpoint`), not card data. Each text is
written from the card's own values: the all-passed text names the next milestone ("Milestone 2 is
unlocked." for set 1's milestone 1 of 4), and the pass and fail texts name the card's threshold
and rubric size ("Needs at least 3 of 4", true of every set here).
