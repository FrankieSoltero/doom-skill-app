// The Explore tab's strings (Explore plan), read through `copy`. copy.test.ts is at its line
// limit, so they are tested here.
import { copy } from '../index';

describe('copy for the Explore list', () => {
  it('names the two row actions', () => {
    expect(copy.explore.open).toBe('Open');
    expect(copy.explore.build).toBe('Build');
  });

  it('names the Create button after the text', () => {
    expect(copy.explore.createText('zzqx')).toBe('Create zzqx');
  });

  it('reads a row as its label, its group when it has one, and its action', () => {
    expect(copy.explore.row('C++', 'Build', 'code')).toBe('C++, code, Build');
    expect(copy.explore.row('Strudel', 'Open', null)).toBe('Strudel, Open');
  });
});
