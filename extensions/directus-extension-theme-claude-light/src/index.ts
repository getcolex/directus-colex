import { defineTheme } from '@directus/extensions-sdk';

export default defineTheme({
  id: 'colex-light',
  name: 'Colex Light',
  appearance: 'light',
  rules: {
    // === GLOBAL COLORS ===
    background: '#F8F7F4',
    backgroundAccent: '#FFFFFF',
    backgroundNormal: '#ECEAE6',
    backgroundSubdued: '#FBFAF8',

    foreground: '#1A1A1A',
    foregroundAccent: '#2D2D2D',
    foregroundSubdued: '#78716C',

    // === PRIMARY (Dark - matches text for icons/buttons) ===
    primary: '#1A1A1A',
    primaryBackground: 'color-mix(in srgb, #1A1A1A 10%, transparent)',
    primarySubdued: 'color-mix(in srgb, #1A1A1A 50%, #F8F7F4)',
    primaryAccent: '#2D2D2D',

    // === SECONDARY (Burgundy accent) ===
    secondary: '#440D2F',
    secondaryBackground: 'color-mix(in srgb, #440D2F 10%, transparent)',
    secondarySubdued: 'color-mix(in srgb, #440D2F 50%, #F8F7F4)',
    secondaryAccent: '#5C1A3F',

    // === STATUS COLORS (Warm palette) ===
    success: '#15803D',
    successBackground: 'color-mix(in srgb, #15803D 10%, transparent)',
    successSubdued: 'color-mix(in srgb, #15803D 50%, #F8F7F4)',
    successAccent: '#22C55E',

    warning: '#B45309',
    warningBackground: 'color-mix(in srgb, #B45309 10%, transparent)',
    warningSubdued: 'color-mix(in srgb, #B45309 50%, #F8F7F4)',
    warningAccent: '#D97706',

    danger: '#B91C1C',
    dangerBackground: 'color-mix(in srgb, #B91C1C 10%, transparent)',
    dangerSubdued: 'color-mix(in srgb, #B91C1C 50%, #F8F7F4)',
    dangerAccent: '#DC2626',

    // === BORDERS (Sharp corners, warm tones) ===
    borderColor: '#E7E5E4',
    borderColorAccent: '#D6D3D1',
    borderColorSubdued: '#F5F5F4',
    borderRadius: '4px',
    borderWidth: '1px',

    // === FONTS ===
    fontFamily: {
      display: '"Inter", sans-serif',
      sansSerif: '"Inter", sans-serif',
      serif: '"Merriweather", serif',
      monospace: '"JetBrains Mono", monospace',
    },

    // === NAVIGATION (Left module bar) ===
    navigation: {
      background: '#FFFFFF',
      backgroundAccent: '#F8F7F4',
      borderColor: '#E7E5E4',
      borderWidth: '1px',

      project: {
        background: '#FFFFFF',
        foreground: '#1A1A1A',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        borderColor: '#E7E5E4',
        borderWidth: '1px',
      },

      modules: {
        background: '#FFFFFF',
        button: {
          background: '#FFFFFF',
          backgroundHover: '#F8F7F4',
          backgroundActive: '#44403C',
          foreground: '#78716C',
          foregroundHover: '#1A1A1A',
          foregroundActive: '#FFFFFF',
        },
      },
    },

    // === SIDEBAR ===
    sidebar: {
      background: '#FFFFFF',
      foreground: '#1A1A1A',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      borderColor: '#E7E5E4',
      borderWidth: '1px',

      section: {
        toggle: {
          icon: {
            foreground: '#78716C',
            foregroundHover: '#1A1A1A',
            foregroundActive: '#440D2F',
          },
          foreground: '#1A1A1A',
          foregroundHover: '#1A1A1A',
          foregroundActive: '#440D2F',
          background: '#FFFFFF',
          backgroundHover: '#F8F7F4',
          backgroundActive: 'rgba(68, 13, 47, 0.08)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderColor: '#E7E5E4',
          borderWidth: '1px',
        },
      },
    },

    // === HEADER ===
    header: {
      background: '#F8F7F4',
      borderColor: '#E7E5E4',
      borderWidth: '1px',
      boxShadow: 'none',
      headline: {
        foreground: '#78716C',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      title: {
        foreground: '#1A1A1A',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '600',
      },
    },

    // === FORMS ===
    form: {
      columnGap: '32px',
      rowGap: '24px',

      field: {
        label: {
          foreground: '#78716C',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        input: {
          background: '#FFFFFF',
          backgroundSubdued: '#F8F7F4',
          foreground: '#1A1A1A',
          foregroundSubdued: '#78716C',
          borderColor: '#E7E5E4',
          borderColorHover: '#D6D3D1',
          borderColorFocus: '#440D2F',
          boxShadow: 'none',
          boxShadowHover: 'none',
          boxShadowFocus: '0 0 0 2px rgba(68, 13, 47, 0.2)',
          height: '44px',
          padding: '12px',
        },
      },
    },

    // === PUBLIC PAGES (Login, etc.) ===
    public: {
      background: '#F8F7F4',
      foreground: '#1A1A1A',
      foregroundAccent: '#78716C',

      art: {
        background: '#F8F7F4',
        primary: '#440D2F',
        secondary: '#E7E5E4',
        speed: '2',
      },

      form: {
        field: {
          input: {
            background: '#FFFFFF',
            foreground: '#1A1A1A',
            backgroundSubdued: '#F8F7F4',
            foregroundSubdued: '#78716C',
            borderColor: '#E7E5E4',
            borderColorHover: '#D6D3D1',
            borderColorFocus: '#440D2F',
            boxShadow: 'none',
            boxShadowHover: 'none',
            boxShadowFocus: '0 0 0 2px rgba(68, 13, 47, 0.2)',
          },
        },
      },
    },

    // === POPOVERS ===
    popover: {
      menu: {
        background: '#FFFFFF',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
    },

    // === BANNER ===
    banner: {
      background: '#1A1A1A',
      padding: '40px',
      avatar: {
        foreground: '#FFFFFF',
      },
      headline: {
        foreground: '#78716C',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      title: {
        foreground: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '600',
      },
      subtitle: {
        foreground: '#78716C',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      art: {
        foreground: '#44403C',
      },
    },
  },
});
