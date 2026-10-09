/**
 * UI strings of a topic's levels: the level badge, Explore's range, the topic screen's levels row,
 * the unlock moment under a passed checkpoint, and the Q&A byline. Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** A topic's levels (M10 plan L, Task 13; decisions L16, L17). */
export const levels = {
  /** A level's badge. */
  badge: (n: number) => `Level ${String(n)}`,
  /** Explore's line for a root with `n` levels. */
  range: (n: number) => (n > 1 ? `Levels 1–${String(n)}` : 'Level 1'),
  /** The unlock moment's heading: the level finished and the points it paid. */
  completed: (n: number, p: number) => `Level ${String(n)} complete · +${String(p)} points`,
  /** The button to the next level when the learner is enrolled in it (`next` = `enrolled`). */
  continueTo: (n: number) => `Continue to Level ${String(n)}`,
  /** The next level is being built for this learner (`next` = `building`). */
  building: (n: number) => `Level ${String(n)} is being built — you'll be the first in.`,
  /** The next level is built and waits to be published (`next` = `waiting`). */
  waiting: (n: number) => `Level ${String(n)} is nearly ready.`,
  /** No level beyond this one (`next` = `deepest`). */
  deepest: "You've reached the deepest level for now.",
  /** The next level's build failed (`next` = `failed`). */
  failed: (n: number) => `Level ${String(n)} couldn't be built.`,
  /** The hint on a locked level in the levels row. */
  locked: 'Finish the level below to unlock',
  /** The Q&A byline's level, after the author's name; shown only when n > 1. */
  byline: (n: number) => ` · Level ${String(n)}`,
  /** The unlock card's heading when the next level is a choice of projects (`next` = `choose`; M21). */
  choose: (n: number) => `Choose your Level ${String(n)} project`,
  /** Shown while the projects are drafted (`choose` with no choices yet). */
  drafting: (n: number) => `Drafting your Level ${String(n)} projects…`,
  /** Shown when the projects did not arrive within the polls. */
  choicesLater: (n: number) => `Pick your Level ${String(n)} project on the topic screen.`,
  /** A 409 `Variant chosen`: the learner already chose another variant of this level. */
  chosenOther: 'You picked another project for this level.',
  /** One project choice: its title and style. */
  choiceLine: (title: string, style: string) => `${title} · ${style}`,
  /** The button that chooses a project. */
  pick: 'Choose',
};
