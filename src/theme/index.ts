import { Platform } from 'react-native';

/**
 * GlucoAI Design Tokens — Bevel-inspired LIGHT premium theme.
 * Extracted from the Claude Design "Accueil Santé" prototype:
 * light background #F2F2F6, near-white cards #FDFDFE, soft ambient
 * shadows, generous radii, ink-black CTAs, pastel accents.
 */

/**
 * GlucoAI official design system — extracted from the
 * "design application" folder (single source of truth).
 * Violet #6D5EF9 = primary CTA · Vert #19C37D = active/success ·
 * Orange #FF7A1A · Bleu #3B82F6 · fond #F7F8FC · texte #111827.
 */
export const colors = {
  // Backgrounds
  background: '#F9FAFE',
  backgroundElevated: '#FFFFFF',
  surface: '#FFFFFF', // cards
  surface2: '#F3F0FF', // light purple inset
  surface3: '#EEF1F7', // grouped buttons / chips background
  glassBorder: '#EEF1F7',
  glassHighlight: 'rgba(255,255,255,0.85)',

  // Primary CTA — green-first design: main buttons are green,
  // violet stays secondary (Bolus, Glucides, Assistant).
  ink: '#19C37D',
  inkStrong: '#14A96B',

  // Accents (official palette)
  primary: '#19C37D', // green — active states, success
  primaryDim: '#E9FBF2', // success light
  ai: '#3B82F6', // blue
  aiDim: 'rgba(59,130,246,0.12)',
  warning: '#FF7A1A', // orange (alerts, energy)
  warningDim: 'rgba(255,122,26,0.12)',
  danger: '#FF3B30',
  dangerDim: 'rgba(255,59,48,0.12)',
  gold: '#F2C356',

  // Brand purples
  purple: '#6D5EF9',
  purpleLight: '#A78BFA',
  purpleSoft: '#F3F0FF',
  purpleDim: 'rgba(109,94,249,0.12)',

  // Macro / metric accents (per the design board)
  lipids: '#FF7A1A', // orange
  carbs: '#6D5EF9', // violet
  protein: '#19C37D', // green
  cycle: '#EE4D8F',

  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textPlaceholder: '#C3C8D4',
  textOnPrimary: '#FFFFFF',
  textOnInk: '#FFFFFF',

  // Glucose semantic
  glucoseLow: '#FF7A1A',
  glucoseInRange: '#19C37D',
  glucoseHigh: '#F2B84B',
  glucoseVeryHigh: '#FF3B30',

  // Ring track
  ringTrack: '#EEF1F7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 999,
} as const;

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default:
    "-apple-system, 'SF Pro Display', Inter, 'Segoe UI', Roboto, sans-serif",
});

export const typography = {
  // 29px 800 — "Aujourd'hui, 2 juillet"
  largeTitle: {
    fontFamily,
    fontSize: 29,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: colors.text,
  },
  display: {
    fontFamily,
    fontSize: 30,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: colors.text,
  },
  // 26px 800 — detail page titles
  heading: {
    fontFamily,
    fontSize: 26,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
    color: colors.text,
  },
  // 22px 700 — section headers ("Nutrition", "Cycle"…)
  section: {
    fontFamily,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    color: '#232328',
  },
  // 18-19px 650 — card titles
  title: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    color: colors.text,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400' as const,
    color: colors.text,
  },
  bodyMedium: {
    fontFamily,
    fontSize: 16,
    fontWeight: '500' as const,
    color: colors.text,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  label: {
    fontFamily,
    fontSize: 15,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  metric: {
    fontFamily,
    fontSize: 30,
    fontWeight: '750' as any,
    letterSpacing: -0.5,
    color: colors.text,
  },
} as const;

/**
 * Bevel signature card shadow — a tight contact shadow layered under a
 * soft, wide ambient shadow. On iOS/Android RN only supports one shadow,
 * so we approximate the ambient layer (the more visible one).
 */
export const shadows = {
  card: Platform.select({
    web: {
      boxShadow:
        '0 1px 2px rgba(20,20,30,0.03), 0 4px 14px rgba(20,20,30,0.04)',
    },
    default: {
      shadowColor: '#141420',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
      elevation: 3,
    },
  }) as object,
  floating: Platform.select({
    web: {
      boxShadow:
        '0 10px 28px rgba(20,20,30,0.12), 0 0 0 0.5px rgba(20,20,30,0.04)',
    },
    default: {
      shadowColor: '#141420',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 28,
      elevation: 12,
    },
  }) as object,
  /** Softer, wider ambient shadow for the redesigned form/settings cards. */
  soft: Platform.select({
    web: {
      boxShadow:
        '0 2px 4px rgba(17,24,39,0.03), 0 8px 24px rgba(17,24,39,0.05)',
    },
    default: {
      shadowColor: '#111827',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.05,
      shadowRadius: 18,
      elevation: 2,
    },
  }) as object,
} as const;
