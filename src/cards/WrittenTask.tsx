import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { useCardTextColor } from '../components/cardTextColor';
import { Passage } from '../components/Passage';
import { copy } from '../copy';
import { type } from '../theme';

/**
 * The most lines of the task the card shows: 6 of the body's 23 points, 138 points, what the
 * written card's height budget leaves room for (CheckpointCard.height.test.ts).
 */
const TASK_LINES = 6;

type WrittenTaskProps = {
  /** The milestone's task, as the API serves it. */
  task: string;
  /** The checkpoint's title: the sheet's heading. */
  title: string;
};

/**
 * The task of a written checkpoint card (M9 plan J Task 8), above its editor: the body text in the
 * card's text color, cut to `TASK_LINES` lines. A tap opens the whole task as a passage in a
 * bottom sheet under the checkpoint's title; Close, a tap above it or the Android back button
 * closes it. A screen reader reads the whole task, with the hint "Read the task".
 */
export function WrittenTask({ task, title }: WrittenTaskProps) {
  const color = useCardTextColor();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID="checkpoint-task"
        accessibilityRole="button"
        accessibilityHint={copy.readTask}
        onPress={() => {
          setOpen(true);
        }}
      >
        <Text
          testID="checkpoint-task-text"
          numberOfLines={TASK_LINES}
          style={[type.body, { color }]}
        >
          {task}
        </Text>
      </Pressable>
      <BottomSheet
        visible={open}
        title={title}
        cancelLabel={copy.sources.close}
        onClose={() => {
          setOpen(false);
        }}
        testID="task-sheet"
      >
        <Passage text={task} />
      </BottomSheet>
    </>
  );
}
