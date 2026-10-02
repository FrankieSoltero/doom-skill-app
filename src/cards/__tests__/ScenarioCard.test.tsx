import { screen } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { useFeedStore } from '../../feed/store';
import { cardsByType } from '../../feed/testing/sets';
import { cardTheme, colors, fonts } from '../../theme';
import { ScenarioCard } from '../ScenarioCard';
import {
  answerAt,
  gridCells,
  nextCardDisabled,
  optionNames,
  partsInOrder,
  pickOption,
  renderChoiceCard,
  responsesAfterPick,
} from '../testing/choiceCards';

/** The page this card sits on in the tests: not 0, so an index mix-up shows. */
const INDEX = 1;
const { scenario } = cardsByType;
const ORDER = ['card-kicker-row', 'passage', 'choice-options', 'scenario-spacer'];

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

/** Draws the scenario card at INDEX, with nothing answered. */
function renderScenario() {
  return renderChoiceCard((onNext) => (
    <ScenarioCard card={scenario} index={INDEX} onNext={onNext} />
  ));
}

describe('ScenarioCard content', () => {
  it('shows the kicker Scenario and its node, on the predict color', () => {
    renderScenario();

    expect(textStyleOf(screen.getByText('Scenario · photosynthesis'))).toMatchObject({
      textTransform: 'uppercase',
    });
    expect(screen.getByText('~45 s')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(
      cardTheme.predict.bg,
    );
    expect(screen.getByRole('header', { name: 'What happens next?' })).toBeOnTheScreen();
  });

  it('shows the situation in a passage block between the title and the options', () => {
    renderScenario();

    expect(screen.getByTestId('passage-text')).toHaveTextContent(scenario.situation, {
      exact: true,
    });
    expect(partsInOrder(/^(card-kicker-row|passage|choice-options|scenario-spacer)$/)).toEqual(
      ORDER,
    );
  });

  it('shows its options as a grid of two rows of two, in the body font', () => {
    renderScenario();

    expect(gridCells()).toStrictEqual([2, 2]);
    expect(optionNames()).toStrictEqual(scenario.options);
    scenario.options.forEach((label) => {
      expect(textStyleOf(screen.getByText(label)).fontFamily).toBe(fonts.body);
    });
  });
});

describe('ScenarioCard picking, as a quiz', () => {
  it('Next card waits for a pick; a pick is stored, marked and explained', () => {
    renderScenario();
    expect(nextCardDisabled()).toBe(true);

    pickOption('Nothing changes');

    expect(answerAt(INDEX)).toStrictEqual({ kind: 'choice', picked: 2 });
    expect(optionNames()[0]).toBe('It makes less sugar. Correct answer.');
    expect(textStyleOf(screen.getByText('It makes less sugar')).color).toBe(colors.aqua);
    expect(screen.getByTestId('choice-explanation')).toHaveTextContent(
      'Not quite. Without light, photosynthesis slows, so the plant makes less sugar.',
    );
    expect(nextCardDisabled()).toBe(false);
  });

  it('sends the pick to the outbox as a choice', () => {
    const draw = (onNext: () => void) => <ScenarioCard card={scenario} index={0} onNext={onNext} />;

    expect(responsesAfterPick(scenario, draw, 'It makes less sugar')).toStrictEqual([
      { choice: 0 },
    ]);
  });
});
