import { boldSegments } from './boldSegments';

/**
 * What a screen reader hears for bold-marked `text` (rule SS-11): the text with its paired `**`
 * markers removed. An unpaired marker stays, as `BoldText` shows it.
 */
export function spokenText(text: string): string {
  return boldSegments(text)
    .map((segment) => segment.text)
    .join('');
}
