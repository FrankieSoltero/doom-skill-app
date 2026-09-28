import { spokenText } from '../spokenText';

describe('spokenText', () => {
  it.each([
    ['plain text', 'A rest.', 'A rest.'],
    ['a bold run', 'A **rest**. It keeps a step silent.', 'A rest. It keeps a step silent.'],
    ['a verdict and an explanation', '**Correct.** `*4` repeats.', 'Correct. `*4` repeats.'],
    ['two bold runs', '**a** and **b**', 'a and b'],
    ['an unpaired marker, kept as typed', 'hh**8 plays', 'hh**8 plays'],
    ['an empty pair, removed', 'x****y', 'xy'],
    ['an empty string', '', ''],
  ])('reads %s without its paired bold markers', (_, text, expected) => {
    expect(spokenText(text)).toBe(expected);
  });

  it('treats nothing but `**` as markup', () => {
    expect(spokenText('<b>bold</b> _it_ *one*')).toBe('<b>bold</b> _it_ *one*');
  });
});
