import { demoCard } from '../testing/demoCards';

describe('demoCard', () => {
  it('serves a card of each asked type, however many times it is called in one file', async () => {
    const quiz = await demoCard('quiz');
    const predict = await demoCard('predict');
    const again = await demoCard('quiz');

    expect(quiz).toMatchObject({ type: 'quiz', node: 'Speed' });
    expect(predict).toMatchObject({ type: 'predict', node: 'Alternation' });
    expect(again).toBe(quiz);
  });
});
