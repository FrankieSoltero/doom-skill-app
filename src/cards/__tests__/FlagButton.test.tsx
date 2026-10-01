import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { logWarning } from '../../log';
import { FlagButton, FlagTarget } from '../FlagButton';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const CARD_ID = '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f';
const QUIZ: Card = { ...cardsByType.quiz, id: CARD_ID };
const REASONS = ['Wrong', 'Unclear', 'Broken', 'Something else'];

type Send = (cardId: string, reason: string) => Promise<void>;

function renderButton(card: Card | null, send: Send | null = jest.fn<Promise<void>, []>()) {
  const onFlagged = jest.fn<undefined, []>();
  const button = <FlagButton onFlagged={onFlagged} send={send} />;
  render(card === null ? button : <FlagTarget card={card}>{button}</FlagTarget>);
  return { onFlagged };
}

const flagAction = () => screen.queryByRole('button', { name: 'Flag this card' });

/** Opens the sheet and presses the reason `label`, letting the send settle. */
async function choose(label: string) {
  fireEvent.press(screen.getByRole('button', { name: 'Flag this card' }));
  fireEvent.press(screen.getByRole('button', { name: label }));
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('FlagButton', () => {
  it('shows no action on a demo card: with no API, the default sender is null', () => {
    render(
      <FlagTarget card={QUIZ}>
        <FlagButton onFlagged={jest.fn()} />
      </FlagTarget>,
    );

    expect(flagAction()).toBeNull();
  });

  it.each([
    ['outside a card the feed drew', null],
    ['on a checkpoint, whose id is a milestone', { ...cardsByType.checkpoint, id: CARD_ID }],
    ['on a card with no server id', cardsByType.quiz],
  ])('shows no action %s', (_where, card: Card | null) => {
    renderButton(card);

    expect(flagAction()).toBeNull();
  });

  it('opens a sheet with the four reasons, in order', () => {
    renderButton(QUIZ);

    fireEvent.press(screen.getByRole('button', { name: 'Flag this card' }));

    const sheet = screen.getByTestId('flag-sheet');
    const labels = within(sheet)
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string);
    expect(labels).toStrictEqual([...REASONS, 'Cancel']);
    expect(within(sheet).getByText('Flag this card')).toBeOnTheScreen();
  });

  it.each([
    ['Wrong', 'wrong'],
    ['Unclear', 'unclear'],
    ['Broken', 'broken'],
    ['Something else', 'other'],
  ])('%s closes the sheet, sends the reason %s once, and thanks', async (label, reason) => {
    const send = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
    const { onFlagged } = renderButton(QUIZ, send);

    await choose(label);

    expect(send.mock.calls).toStrictEqual([[CARD_ID, reason]]);
    expect(onFlagged).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('flag-sheet')).toBeNull();
  });

  it('thanks the same way when the send fails, logs the kind only, and never retries', async () => {
    const send = jest.fn<Promise<void>, [string, string]>(() =>
      Promise.reject(new ApiError('rateLimited', 429)),
    );
    const { onFlagged } = renderButton(QUIZ, send);

    await choose('Broken');

    expect(onFlagged).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['flag_failed', { kind: 'rateLimited' }],
    ]);
  });

  it('Cancel closes the sheet and sends nothing', () => {
    const send = jest.fn<Promise<void>, [string, string]>();
    const { onFlagged } = renderButton(QUIZ, send);

    fireEvent.press(screen.getByRole('button', { name: 'Flag this card' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('flag-sheet')).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(onFlagged).not.toHaveBeenCalled();
  });
});
