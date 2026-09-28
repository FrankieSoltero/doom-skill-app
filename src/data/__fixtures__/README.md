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

## Shape of `cards.extra.fixture.json`

`{ "sets": [ { "cards": [...], "summary": {...} }, ... ] }`, one entry per set, in serving
order. Each entry is a `FeedSet` (`../schema.ts`) without `topic` and `setNumber`: the source
adds the topic from `cards.fixture.json` and the set number, then validates the set with
`feedSetSchema`.

The stated solutions to the exercises and checkpoints are not here, so the app cannot show them.
They live with the tests, in `apps/mobile/scripts/__tests__/fixtures/demoSolutions.json`.

## Fixed feedback copy

The checkpoint feedback is fixed copy in `src/copy/`, not card data. "Needs at least 3 of 4"
fits every set here, since every checkpoint passes at 3 of 4. The all-passed text, "Solid loop.
The alternating bar gives it movement. Milestone 2 is unlocked.", fits only set 1, whose
checkpoint is milestone 1. Sets 2 to 4 are milestones 2, 3 and 4.
