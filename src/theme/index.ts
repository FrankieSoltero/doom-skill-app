// DoomSkill v2 "color" theme. The only home of design tokens.
// OKLCH values from the prototype pre-converted to sRGB hex (RN has no oklch()).

export const colors = {
  paper: '#f2f2f3', // screen ground (--color-bg)
  surface: '#e9e9ea',
  ink: '#1d1f20', // text, borders, hard shadows, dark cards (--color-text)
  divider: 'rgba(29,31,32,0.16)',
  neutral: {
    300: '#d4d4d7',
    400: '#b7b7ba',
    500: '#98989b',
    600: '#7a7a7d',
    700: '#5d5d60',
    800: '#424244',
    900: '#2b2b2d',
  },
  // Card-type palette
  violet: '#c3aeff', // oklch(0.80 0.12 295) — concept, Today tab, milestone 2
  coral: '#ffac6e', // oklch(0.82 0.13 55)  — quiz, streak chip, Explore tab
  aqua: '#6ee5d7', // oklch(0.85 0.11 185) — predict, Tree tab, milestone 3
  yellow: '#f9e361', // oklch(0.91 0.15 100) — review, Profile tab, selected segment
  pink: '#fe8dc5', // oklch(0.78 0.15 350) — checkpoint, milestone 4
  lime: '#b0f35f', // oklch(0.89 0.19 130) — exercise accent, code keywords, milestone 1, pass
} as const;

export type CardType =
  'concept' | 'quiz' | 'predict' | 'exercise' | 'review' | 'checkpoint' | 'summary';

export const cardTheme: Record<
  CardType,
  { bg: string; fg: string; shadow: string; kicker: string }
> = {
  concept: { bg: colors.violet, fg: colors.ink, shadow: colors.ink, kicker: colors.ink },
  quiz: { bg: colors.coral, fg: colors.ink, shadow: colors.ink, kicker: colors.ink },
  predict: { bg: colors.aqua, fg: colors.ink, shadow: colors.ink, kicker: colors.ink },
  exercise: { bg: colors.ink, fg: colors.paper, shadow: colors.lime, kicker: colors.lime },
  review: { bg: colors.yellow, fg: colors.ink, shadow: colors.ink, kicker: colors.ink },
  checkpoint: { bg: colors.pink, fg: colors.ink, shadow: colors.ink, kicker: colors.ink },
  summary: { bg: colors.ink, fg: colors.paper, shadow: colors.pink, kicker: colors.paper },
};

// Beat-grid row colors, in order of first appearance in the code
export const gridRowColors = [colors.lime, colors.pink, colors.aqua, colors.yellow];
export const sparkColors = [
  colors.violet,
  colors.coral,
  colors.aqua,
  colors.yellow,
  colors.pink,
  colors.lime,
];

export const fonts = {
  // expo-google-fonts: @expo-google-fonts/barlow-condensed, @expo-google-fonts/barlow
  heading: 'BarlowCondensed_600SemiBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodyBold: 'Barlow_700Bold',
  mono: 'Menlo', // iOS system mono; use 'monospace' on Android
};

export const type = {
  screenTitle: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 25 }, // "Today"
  tabTitle: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 32 }, // Tree / Explore / Profile
  cardTitleL: { fontFamily: fonts.heading, fontSize: 38, lineHeight: 38 }, // concept, review
  cardTitleM: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 33 }, // quiz; predict=34
  cardTitleS: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 29 }, // exercise=28, checkpoint=30
  summaryTitle: { fontFamily: fonts.heading, fontSize: 50, lineHeight: 48 },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  button: { fontFamily: fonts.heading, fontSize: 18 },
  code: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 22 },
  stat: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 40 },
};

export const space = { 1: 3.4, 2: 6.8, 3: 10.2, 4: 13.6, 6: 20.4, 8: 27.2 };

export const border = { hairline: 1, strong: 1.5 };
export const radius = 0; // everything is square-cornered

// Hard offset shadow (neo-brutalist). RN: render as an absolutely positioned
// View behind the card, offset by (x,y) — iOS shadowRadius:0 also works but
// Android elevation can't do hard offsets.
export const hardShadow = { card: 5, option: 3, small: 2 };

export const motion = {
  pager: { duration: 520, easing: [0.2, 0.85, 0.25, 1.05] }, // Easing.bezier(...)
  splitWord: {
    duration: 560,
    stagger: 60,
    easing: [0.2, 0.9, 0.25, 1.3],
    fromY: '0.55em',
    fromRotate: 5,
  },
  option: 180,
  rubricPop: { duration: 260, easing: [0.2, 0.9, 0.3, 1.6], scale: 1.15 },
  conceptCycle: 900, // ms per highlighted cycle tile
  beatStep: 140, // ms per 16th step in the beat grid
  countUp: 1300, // ease-out cubic
  masteryBar: { duration: 1100, delay: 350, easing: [0.2, 0.8, 0.2, 1] },
  spark: {
    tap: { count: 8, radius: 20, len: 10, width: 3, ms: 420 },
    burst: { count: 22, radius: 70, len: 16, width: 5, ms: 800 },
  },
};
