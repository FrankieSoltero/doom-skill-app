import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useInputFocus } from '../../feed/inputFocus';
import { colors, fonts } from '../../theme';
import { CodeEditor } from '../CodeEditor';
import { textStyleOf } from '../testing/styles';

const CODE = 'stack(\n  s("bd ~ sd ~"),\n  s("hh*4")\n)';

beforeEach(() => {
  useInputFocus.setState(useInputFocus.getInitialState());
});

/** Draws an editor holding `value`, with a lime caret, and returns its `onChange`. */
function renderEditor(value = CODE, height = 100) {
  const onChange = jest.fn<undefined, [string]>();
  const view = render(
    <CodeEditor value={value} onChange={onChange} caret={colors.lime} height={height} />,
  );
  return { onChange, ...view };
}

const editor = () => screen.getByLabelText('Code editor');
const focusedCount = () => useInputFocus.getState().focusedIds.size;

/** The props of the editor's input that the design and the code language fix. */
function inputProps() {
  const props = editor().props as Record<string, unknown>;
  const names = [
    'multiline',
    'autoCorrect',
    'autoCapitalize',
    'spellCheck',
    'autoComplete',
    'smartInsertDelete',
    'textAlignVertical',
    'scrollEnabled',
    'maxLength',
    'keyboardType',
    'cursorColor',
    'selectionColor',
  ];
  return Object.fromEntries(names.map((name) => [name, props[name]]));
}

describe('CodeEditor', () => {
  it('shows the code in a labeled text input', () => {
    renderEditor();

    expect(editor()).toHaveDisplayValue(CODE);
  });

  it('types code: multiline, no autocorrect, capitals, spell check or smart edits', () => {
    renderEditor();

    expect(inputProps()).toStrictEqual({
      multiline: true,
      autoCorrect: false,
      autoCapitalize: 'none',
      spellCheck: false,
      autoComplete: 'off',
      smartInsertDelete: false,
      textAlignVertical: 'top',
      scrollEnabled: true,
      maxLength: 5000,
      keyboardType: undefined,
      cursorColor: colors.lime,
      selectionColor: colors.lime,
    });
  });

  it('draws paper code text, 14/22 mono, padded 12 and 14, at the given height', () => {
    renderEditor(CODE, 100);

    expect(textStyleOf(editor())).toStrictEqual({
      fontFamily: fonts.mono,
      fontSize: 14,
      lineHeight: 22,
      color: colors.paper,
      paddingVertical: 12,
      paddingHorizontal: 14,
      height: 100,
    });
  });

  it('follows the height it is given', () => {
    renderEditor(CODE, 140);

    expect(textStyleOf(editor()).height).toBe(140);
  });

  it('calls onChange with each new text, and keeps showing the value it is given', () => {
    const { onChange } = renderEditor();

    fireEvent.changeText(editor(), 's("hh*8")');

    expect(onChange.mock.calls).toStrictEqual([['s("hh*8")']]);
    expect(editor()).toHaveDisplayValue(CODE);
  });
});

describe('CodeEditor focus', () => {
  it('sets the feed focus flag while focused and clears it on blur', () => {
    renderEditor();

    fireEvent(editor(), 'focus');
    expect(focusedCount()).toBe(1);

    fireEvent(editor(), 'blur');
    expect(focusedCount()).toBe(0);
  });

  it('clears the flag when it is removed while focused', () => {
    const { unmount } = renderEditor();

    fireEvent(editor(), 'focus');
    act(() => {
      unmount();
    });

    expect(focusedCount()).toBe(0);
  });

  it('gives two editors ids of their own', () => {
    const onChange = jest.fn<undefined, [string]>();
    render(
      <>
        <CodeEditor value="a" onChange={onChange} caret={colors.lime} height={100} />
        <CodeEditor value="b" onChange={onChange} caret={colors.lime} height={100} />
      </>,
    );
    const [first, second] = screen.getAllByLabelText('Code editor');
    if (first === undefined || second === undefined) throw new Error('two editors expected');

    fireEvent(first, 'focus');
    fireEvent(second, 'focus');
    fireEvent(first, 'blur');

    expect(focusedCount()).toBe(1);
  });
});
