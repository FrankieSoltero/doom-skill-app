/** A run of text drawn in one weight. */
type Segment = { text: string; bold: boolean };

/** The bold marker, as the design writes it (docs/design/card-feed/README.md:53, :73, :118). */
const MARKER = '**';

/** Adds `text` to `segments`, skipping empty text and merging it into a neighbor of its weight. */
function append(segments: Segment[], text: string, bold: boolean): void {
  if (text.length === 0) return;
  const last = segments.at(-1);
  if (last?.bold === bold) {
    last.text += text;
  } else {
    segments.push({ text, bold });
  }
}

/**
 * Splits `text` into plain and bold runs. Text between a pair of `**` markers is bold and the
 * markers are removed; a marker with no partner is kept as typed. There is no other markup.
 *
 * The result is minimal: no segment is empty and no two neighbors share a weight, so an empty
 * pair (`****`) disappears and adjacent pairs join. Joining the segments' text gives the input
 * with its paired markers removed.
 *
 * It runs in linear time: each `indexOf` starts where the last one ended, and there is no regex.
 */
export function boldSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let plainStart = 0;
  let open = text.indexOf(MARKER);
  while (open !== -1) {
    const close = text.indexOf(MARKER, open + MARKER.length);
    if (close === -1) break;
    append(segments, text.slice(plainStart, open), false);
    append(segments, text.slice(open + MARKER.length, close), true);
    plainStart = close + MARKER.length;
    open = text.indexOf(MARKER, plainStart);
  }
  append(segments, text.slice(plainStart), false);
  return segments;
}
