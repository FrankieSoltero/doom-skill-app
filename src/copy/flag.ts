/**
 * UI strings of the flag action on a card and its sheet (M6 plan, Task 3). Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The flag action in a card frame's corner (src/cards/FlagButton.tsx). */
export const flag = {
  /** The flag button's spoken label, and the sheet's title. */
  action: 'Flag this card',
  /** The four reasons, in the sheet's order, by the API's reason. */
  reasons: {
    wrong: 'Wrong',
    unclear: 'Unclear',
    broken: 'Broken',
    other: 'Something else',
  },
  /** Closes the sheet without flagging. */
  cancel: 'Cancel',
  /** The fixed line shown after a reason is chosen, whatever the API answered. */
  thanks: "Thanks. We'll look at this card.",
};
