// The feed screen's keypad (M9 plan K, Task 7; P7): the screen draws the keypad sheet once, over
// the bottom of the feed, with a backdrop above it while an editor shows it, so a tap outside the
// editor hides it; and it hides the sheet when the learner moves to another card. The cards here
// are stand-ins; the store's `show` stands in for an editor's focus (CodeEditor.insert.test.tsx).
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import type { Card } from '../../data';
import type { Keypad } from '../../data/keypadSchema';
import { useKeypad } from '../../feed/keypad';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { scriptedSource } from '../../feed/testing/sources';
import { renderFeed, stubCard, stubNext } from '../testing/feed';
import { layout, settle, swipe } from '../testing/pager';
import { viewStyleOf } from '../testing/styles';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEYS: Keypad = {
  groups: [{ name: 'calls', keys: [{ label: 's("")', insert: 's("")', caret: 2 }] }],
  action: 'run',
};
const { concept } = cardsByType;

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useKeypad.setState(useKeypad.getInitialState(), true);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Renders the feed over one set of `cards`, drawn as stand-ins, and lays the pager out. */
async function renderSet(cards: Card[]) {
  await renderFeed(scriptedSource(makeSet(12, cards)), stubCard);
  await layout(700);
}

/** Shows the keypad, as an editor's focus does. */
function showKeys() {
  act(() => {
    useKeypad.getState().show(KEYS, 'editor-1');
  });
}

describe('FeedScreen keypad sheet', () => {
  it('draws no sheet and no backdrop while no editor shows the keypad', async () => {
    await renderSet([concept, concept]);

    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(screen.queryByTestId('keypad-backdrop')).toBeNull();
  });

  it('draws the sheet once, over the bottom of the feed, with a backdrop above it', async () => {
    await renderSet([concept, concept]);

    showKeys();

    expect(screen.getAllByTestId('keypad-sheet')).toHaveLength(1);
    expect(viewStyleOf(screen.getByTestId('keypad-layer'))).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'flex-end',
    });
    const backdrop = screen.getByTestId('keypad-backdrop');
    expect(viewStyleOf(backdrop)).toMatchObject({ flex: 1 });
    // Not for a screen reader: the sheet offers its own escape action.
    expect(backdrop.props).toMatchObject({ accessible: false, importantForAccessibility: 'no' });
  });

  it('lets touches through to the feed while the keypad is hidden', async () => {
    await renderSet([concept, concept]);

    expect(screen.getByTestId('keypad-layer').props).toHaveProperty('pointerEvents', 'box-none');
  });

  it('hides the sheet and dismisses the keyboard on a tap on the backdrop', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderSet([concept, concept]);
    showKeys();

    fireEvent.press(screen.getByTestId('keypad-backdrop'));

    expect(useKeypad.getState().active).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(screen.queryByTestId('keypad-backdrop')).toBeNull();
  });

  it('hides the sheet when the next card comes on', async () => {
    await renderSet([concept, concept]);
    showKeys();

    fireEvent.press(screen.getByRole('button', { name: stubNext(0) }));
    await settle();

    expect(useFeedStore.getState().index).toBe(1);
    expect(useKeypad.getState().active).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it('hides the sheet, and ends an ABC turn, when a swipe moves to another card', async () => {
    await renderSet([concept, concept]);
    showKeys();
    act(() => {
      useKeypad.getState().useSystem();
    });
    expect(useKeypad.getState().systemKeyboard).toBe('editor-1');

    await swipe(-80);

    expect(useFeedStore.getState().index).toBe(1);
    expect(useKeypad.getState().systemKeyboard).toBeNull();
  });

  it('keeps the sheet while the card stays', async () => {
    await renderSet([concept, concept]);
    showKeys();

    act(() => {
      useFeedStore.setState({ streak: 13 });
    });

    expect(useKeypad.getState().active).not.toBeNull();
    expect(screen.getByTestId('keypad-sheet')).toBeOnTheScreen();
  });
});
