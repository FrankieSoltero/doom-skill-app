import { render, screen, within } from '@testing-library/react-native';

import { colors, hardShadow } from '../../theme';
import { MilestoneSection } from '../MilestoneSection';
import { viewStyleOf } from '../testing/styles';

const node = (title: string, mastery: number, unlocked: boolean) => ({
  id: title,
  slug: title.toLowerCase(),
  title,
  summary: '',
  estimated_minutes: 5,
  milestone_id: 'm2',
  mastery,
  unlocked,
});
const MILESTONE = { id: 'm2', position: 2, title: 'Mini-notation' };

describe('MilestoneSection', () => {
  it('heads the section with its number in its color and its title, then one row per node', () => {
    render(
      <MilestoneSection
        milestone={MILESTONE}
        nodes={[node('Rests', 0.8, true), node('Speed', 0.3, true), node('Euclid', 0, false)]}
      />,
    );

    expect(screen.getByRole('header', { name: 'Mini-notation' })).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('milestone-number'))).toMatchObject({
      backgroundColor: colors.violet,
    });
    expect(within(screen.getByTestId('milestone-number')).getByText('2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rests, 80% mastered')).toBeOnTheScreen();
    expect(screen.getByLabelText('Speed, 30% mastered')).toBeOnTheScreen();
    expect(screen.getByLabelText('Euclid, locked')).toBeOnTheScreen();
    expect(screen.getAllByTestId('node-mastered')).toHaveLength(1);
    expect(screen.getAllByTestId('node-locked')).toHaveLength(1);
    expect(screen.queryByText('Locked')).toBeNull();
  });

  it('casts a hard shadow while any node is unlocked', () => {
    render(<MilestoneSection milestone={MILESTONE} nodes={[node('Rests', 0, true)]} />);

    expect(viewStyleOf(screen.getByTestId('milestone-shadow'))).toMatchObject({
      top: hardShadow.card,
      backgroundColor: colors.ink,
    });
    expect(viewStyleOf(screen.getByTestId('milestone-section')).opacity).toBeUndefined();
  });

  it('dims a milestone whose every node is locked, says so, and drops the shadow', () => {
    render(<MilestoneSection milestone={MILESTONE} nodes={[node('Euclid', 0, false)]} />);

    expect(screen.getByText('Locked')).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('milestone-section'))).toMatchObject({ opacity: 0.6 });
    expect(screen.queryByTestId('milestone-shadow')).toBeNull();
  });
});
