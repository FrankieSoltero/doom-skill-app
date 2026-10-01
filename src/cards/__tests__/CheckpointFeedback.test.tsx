// The server's grade under the checkpoint card's on-phone result (src/cards/CheckpointFeedback.tsx).
import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, StyleSheet, Text } from 'react-native';

import type { ServerResult } from '../../feed/useCheckpointResult';
import { CheckpointFeedback } from '../CheckpointFeedback';

const PENDING_LINE = 'Getting detailed feedback…';
const UNAVAILABLE_LINE = "Detailed feedback isn't available right now.";
const FOLLOWS = 'Your milestone progress follows the detailed grade.';

const graded = (passed: boolean, overrides: Record<string, unknown> = {}): ServerResult => ({
  status: 'graded',
  grade: {
    status: 'graded',
    passed,
    score: 0.625,
    feedback: 'Solid groove. Vary the snare.',
    criteria: [
      { name: 'rhythm', score: 0.75, justification: 'The kick is steady.' },
      { name: 'variation', score: 0.5, justification: 'Bars repeat.' },
    ],
    ...overrides,
  },
});

function draw(result: ServerResult, localPassed: boolean | null = true) {
  return render(<CheckpointFeedback result={result} localPassed={localPassed} />);
}

/** Every text drawn, in order. */
const texts = () => screen.UNSAFE_queryAllByType(Text).map((t) => String(t.props.children));

const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

beforeEach(() => {
  announce.mockClear();
});

describe('CheckpointFeedback', () => {
  it('draws nothing before a submission', () => {
    draw({ status: 'none' });

    expect(texts()).toStrictEqual([]);
  });

  it('draws one quiet line while the grade is pending', () => {
    draw({ status: 'pending' });

    expect(texts()).toStrictEqual([PENDING_LINE]);
  });

  it('draws one fixed line when the detailed feedback is unavailable', () => {
    draw({ status: 'unavailable' });

    expect(texts()).toStrictEqual([UNAVAILABLE_LINE]);
  });

  it('draws the verdict, the feedback and each criterion with its score and sentence', () => {
    draw(graded(true));

    expect(texts()).toStrictEqual([
      'Detailed grade: passed · 63%',
      'Solid groove. Vary the snare.',
      'rhythm · 75%',
      'The kick is steady.',
      'variation · 50%',
      'Bars repeat.',
    ]);
  });

  it('announces the verdict once it arrives, and nothing before', () => {
    const view = draw({ status: 'pending' });
    expect(announce).not.toHaveBeenCalled();

    view.rerender(<CheckpointFeedback result={graded(true)} localPassed />);
    expect(announce.mock.calls).toStrictEqual([['Detailed grade: passed · 63%']]);
  });

  it('shows both results when they differ, and says which one decides progress', () => {
    draw(graded(false), true);

    expect(texts()).toContain('Detailed grade: not yet · 63%');
    expect(texts()).toContain(FOLLOWS);
  });

  it('says nothing about progress when the two results agree', () => {
    draw(graded(true), true);

    expect(texts()).not.toContain(FOLLOWS);
  });

  it('leaves out what a grade lacks: no score, no feedback, no criteria', () => {
    draw(graded(true, { score: null, feedback: null, criteria: null }));

    expect(texts()).toStrictEqual(['Detailed grade: passed']);
  });

  it('shows server text as typed: markup is not read', () => {
    const markup = '<b>bold</b> **not bold** <script>x()</script>';
    draw(
      graded(true, {
        feedback: markup,
        criteria: [{ name: '<i>n</i>', score: 1, justification: markup }],
      }),
    );

    expect(texts()).toStrictEqual([
      'Detailed grade: passed · 63%',
      markup,
      '<i>n</i> · 100%',
      markup,
    ]);
  });

  it('bounds the lines of every server text', () => {
    draw(graded(true));

    const unbounded = screen
      .UNSAFE_queryAllByType(Text)
      .filter((t) => typeof t.props.numberOfLines !== 'number');
    expect(unbounded).toHaveLength(0);
  });

  it('scrolls the graded feedback inside a bounded area that may shrink, never grow', () => {
    draw(graded(true));

    const style = StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.style) as Record<
      string,
      unknown
    >;
    expect(style).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    expect(style.maxHeight).toEqual(expect.any(Number));
  });
});
