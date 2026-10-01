import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, type } from '../../theme';
import { TabScreen } from '../TabScreen';
import { textStyleOf, viewStyleOf } from '../testing/styles';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderTabScreen(kicker?: string) {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TabScreen testID="some-tab" title="Explore" {...(kicker === undefined ? {} : { kicker })}>
        <Text>content</Text>
      </TabScreen>
    </SafeAreaProvider>,
  );
}

describe('TabScreen', () => {
  it('draws a paper ground padded by the top safe-area inset', () => {
    renderTabScreen();

    expect(viewStyleOf(screen.getByTestId('some-tab'))).toMatchObject({
      flex: 1,
      paddingTop: 47,
      backgroundColor: colors.paper,
    });
  });

  it('heads the content with the title in the tab title style, in ink', () => {
    renderTabScreen();

    const title = screen.getByRole('header', { name: 'Explore' });
    expect(textStyleOf(title)).toMatchObject({ ...type.tabTitle, color: colors.ink });
    expect(screen.getByText('content')).toBeOnTheScreen();
  });

  it('shows a kicker over the title only when given one', () => {
    renderTabScreen('Skill tree');

    expect(textStyleOf(screen.getByText('Skill tree'))).toMatchObject({
      ...type.kicker,
      color: colors.neutral[700],
    });
  });
});
