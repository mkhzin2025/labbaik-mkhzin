/**
 * Design Tokens
 * Central source of truth for Labbaik design system
 * Unified approach: Tailwind-based tokens exported for programmatic access
 */

// Color Palette
export const colors = {
  primary: {
    50: '#f7f4fb',
    100: '#ede4f6',
    200: '#dcc9ee',
    300: '#c7ade5',
    400: '#b292dd',
    500: '#9d76d4',
    600: '#8860cb',
    700: '#643B89', // Primary brand color
    800: '#4a2a63',
    900: '#301a3d',
  },
  secondary: {
    50: '#f5f0fa',
    100: '#e6d7f2',
    200: '#d7bee9',
    300: '#c7a5e1',
    400: '#b88cd8',
    500: '#a973cf',
    600: '#9a5ac6',
    700: '#7a4da3',
    800: '#5a3a7a',
    900: '#3a2651',
  },
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#145231',
  },
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  info: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  neutral: {
    0: '#ffffff',
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
} as const;

// Semantic Colors
export const semanticColors = {
  background: {
    primary: colors.neutral[900],   // Page background
    secondary: colors.neutral[950], // Deep background
    surface: colors.neutral[800],   // Cards, containers
  },
  text: {
    primary: colors.neutral[0],     // Primary text (white)
    secondary: colors.neutral[300], // Secondary text (light gray)
    tertiary: colors.neutral[500],  // Tertiary text (medium gray)
    disabled: colors.neutral[600],  // Disabled text
  },
  border: {
    primary: colors.neutral[700],   // Primary borders
    secondary: colors.neutral[600], // Secondary borders
    light: colors.neutral[800],     // Light borders
  },
  feedback: {
    success: colors.success[500],
    error: colors.error[500],
    warning: colors.warning[500],
    info: colors.info[500],
  },
} as const;

// Typography System (optimized for Arabic)
export const typography = {
  // Display sizes (hero, landing, marketing)
  display: {
    lg: {
      size: '2.25rem',    // 36px
      lineHeight: '2.5rem',
      letterSpacing: '-0.02em',
      weight: 'bold' as const,
    },
    base: {
      size: '1.875rem',   // 30px
      lineHeight: '2.25rem',
      letterSpacing: '-0.02em',
      weight: 'bold' as const,
    },
  },

  // Heading sizes (section titles, card titles)
  heading: {
    lg: {
      size: '1.5rem',     // 24px
      lineHeight: '2rem',
      letterSpacing: '0px',
      weight: 'bold' as const,
    },
    md: {
      size: '1.25rem',    // 20px
      lineHeight: '1.75rem',
      letterSpacing: '0.1px',
      weight: 'semibold' as const,
    },
    sm: {
      size: '1.125rem',   // 18px
      lineHeight: '1.75rem',
      letterSpacing: '0.2px',
      weight: 'semibold' as const,
    },
  },

  // Body text sizes
  body: {
    lg: {
      size: '1rem',       // 16px
      lineHeight: '1.5rem',
      letterSpacing: '0.2px',
      weight: 'normal' as const,
    },
    md: {
      size: '0.875rem',   // 14px
      lineHeight: '1.25rem',
      letterSpacing: '0.3px',
      weight: 'normal' as const,
    },
    sm: {
      size: '0.75rem',    // 12px
      lineHeight: '1rem',
      letterSpacing: '0.4px',
      weight: 'normal' as const,
    },
  },

  // Label/caption sizes
  label: {
    lg: {
      size: '0.875rem',   // 14px
      lineHeight: '1.25rem',
      letterSpacing: '0.3px',
      weight: 'medium' as const,
    },
    md: {
      size: '0.75rem',    // 12px
      lineHeight: '1rem',
      letterSpacing: '0.4px',
      weight: 'medium' as const,
    },
  },
} as const;

// Spacing Scale
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
  '6xl': '56px',
  '7xl': '64px',
  '8xl': '80px',
  '9xl': '96px',
  '10xl': '112px',
  '11xl': '128px',
} as const;

// Border Radius
export const borderRadius = {
  none: '0',
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '32px',
  full: '9999px',
} as const;

// Shadow System
export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} as const;

// Transitions
export const transitions = {
  durations: {
    fast: '100ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Component Sizing
export const componentSizes = {
  // Button sizes
  button: {
    sm: {
      padding: '0.5rem 1rem',
      height: '2rem',       // 32px
      fontSize: '0.875rem', // 14px
    },
    md: {
      padding: '0.625rem 1.25rem',
      height: '2.5rem',     // 40px
      fontSize: '1rem',     // 16px
    },
    lg: {
      padding: '0.75rem 1.5rem',
      height: '3rem',       // 48px
      fontSize: '1rem',     // 16px
    },
  },

  // Input sizes
  input: {
    sm: {
      padding: '0.5rem 0.75rem',
      height: '2rem',       // 32px
      fontSize: '0.875rem', // 14px
    },
    md: {
      padding: '0.625rem 1rem',
      height: '2.5rem',     // 40px
      fontSize: '1rem',     // 16px
    },
    lg: {
      padding: '0.75rem 1.25rem',
      height: '3rem',       // 48px
      fontSize: '1rem',     // 16px
    },
  },

  // Icon sizes
  icon: {
    xs: '16px',
    sm: '20px',
    md: '24px',
    lg: '32px',
    xl: '40px',
  },
} as const;

// Font Families
export const fontFamilies = {
  sans: 'Tajarib Typeface, IBM Plex Sans Arabic, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
  mono: 'IBM Plex Mono, Monaco, Courier New, monospace',
} as const;

// Z-Index Scale
export const zIndex = {
  dropdown: 1000,
  sticky: 1010,
  fixed: 1020,
  modalBackdrop: 1030,
  modal: 1040,
  popover: 1050,
  tooltip: 1060,
} as const;

// Breakpoints
export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Animation Presets
export const animations = {
  fadeIn: 'fadeIn 0.3s ease-out forwards',
  slideUp: 'slideUp 0.3s ease-out forwards',
  slideDown: 'slideDown 0.3s ease-out forwards',
  slideLeft: 'slideLeft 0.3s ease-out forwards',
  slideRight: 'slideRight 0.3s ease-out forwards',
  scaleIn: 'scaleIn 0.2s ease-out forwards',
} as const;

export default {
  colors,
  semanticColors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  componentSizes,
  fontFamilies,
  zIndex,
  breakpoints,
  animations,
};
