// The display-name rule's local pre-check (src/profile/nameRules.ts), against the API's rule.
import { NAME_MAX, NAME_MIN, NAME_PATTERN, nameProblem } from '../nameRules';

describe('nameProblem', () => {
  it.each([['Frankie'], ['abc'], ['a_b c9'], ['x'.repeat(24)], ['  Frank  '], [''], ['   ']])(
    'finds no problem in %j',
    (name) => {
      expect(nameProblem(name)).toBeNull();
    },
  );

  it.each([['ab'], ['a'], [' ab ']])('calls %j too short', (name) => {
    expect(nameProblem(name)).toBe('short');
  });

  it('calls a name longer than 24 characters too long', () => {
    expect(nameProblem('x'.repeat(25))).toBe('long');
  });

  it.each([['Frank!'], ['né né'], ['a-b-c'], ['tab\there']])(
    'calls %j a name with characters the rule refuses',
    (name) => {
      expect(nameProblem(name)).toBe('chars');
    },
  );
});

describe('the rule', () => {
  it('is 3 to 24 characters with the API pattern', () => {
    expect([NAME_MIN, NAME_MAX]).toStrictEqual([3, 24]);
    expect(NAME_PATTERN.source).toBe('^[A-Za-z0-9_][A-Za-z0-9_ ]{1,22}[A-Za-z0-9_]$');
  });
});
