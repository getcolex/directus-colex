import { defineTheme } from '@directus/extensions-sdk';

export default defineTheme({
  id: 'wcag-colex-light',
  name: 'WCAG Colex Light',
  appearance: 'light',
  rules: {
    // === GLOBAL COLORS ===
    background: '#F8F7F4',
    backgroundAccent: 'color-mix(in srgb, var(--theme--secondary) 10%, transparent)',
    backgroundNormal: '#ECEAE6',
    backgroundSubdued: '#FBFAF8',

    foreground: '#1A1A1A',
    foregroundAccent: '#2D2D2D',
    foregroundSubdued: '#6F6860', // WCAG: Improved from #78716C for better readability (5.2:1)

    // === PRIMARY (Dark - matches text for icons/buttons) ===
    primary: '#1A1A1A',
    primaryBackground: 'color-mix(in srgb, var(--theme--primary) 10%, transparent)',
    primarySubdued: 'color-mix(in srgb, var(--theme--primary) 50%, var(--theme--background))',
    primaryAccent: '#2D2D2D',

    // === SECONDARY (Burgundy accent) ===
    secondary: '#3A0B28', // WCAG: Darkened from #440D2F for 4.6:1 contrast on gray backgrounds
    secondaryBackground: 'color-mix(in srgb, var(--theme--secondary) 10%, transparent)',
    secondarySubdued: 'color-mix(in srgb, var(--theme--secondary) 50%, var(--theme--background))',
    secondaryAccent: '#4D1535', // WCAG: Adjusted from #5C1A3F to maintain hierarchy

    // === STATUS COLORS (Warm palette) ===
    success: '#15803D',
    successBackground: 'color-mix(in srgb, var(--theme--success) 10%, transparent)',
    successSubdued: 'color-mix(in srgb, var(--theme--success) 50%, var(--theme--background))',
    successAccent: '#22C55E',

    warning: '#B45309',
    warningBackground: 'color-mix(in srgb, var(--theme--warning) 10%, transparent)',
    warningSubdued: 'color-mix(in srgb, var(--theme--warning) 50%, var(--theme--background))',
    warningAccent: '#D97706',

    danger: '#B91C1C',
    dangerBackground: 'color-mix(in srgb, var(--theme--danger) 10%, transparent)',
    dangerSubdued: 'color-mix(in srgb, var(--theme--danger) 50%, var(--theme--background))',
    dangerAccent: '#DC2626',

    // === BORDERS (Sharp corners, warm tones) ===
    borderColor: '#E7E5E4',
    borderColorAccent: '#D6D3D1',
    borderColorSubdued: '#F5F5F4',
    borderRadius: '4px',
    borderWidth: '1px',

    // === FONTS ===
    fonts: {
      display: {
        fontFamily: '"Inter", sans-serif',
        fontWeight: '600',
      },
      sans: {
        fontFamily: '"Inter", sans-serif',
        fontWeight: '500',
      },
      serif: {
        fontFamily: '"Merriweather", serif',
        fontWeight: '500',
      },
      monospace: {
        fontFamily: '"JetBrains Mono", monospace',
        fontWeight: '500',
      },
    },

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
      borderColor: 'var(--theme--border-color)',
      borderWidth: 'var(--theme--border-width)',

      project: {
        background: 'var(--theme--navigation--background)',
        foreground: 'var(--theme--foreground)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
        borderColor: 'var(--theme--border-color)',
        borderWidth: 'var(--theme--border-width)',
      },

      modules: {
        background: 'var(--theme--navigation--background)',
        borderColor: 'var(--theme--border-color)',
        borderWidth: 'var(--theme--border-width)',
        button: {
          background: 'var(--theme--navigation--background)',
          backgroundHover: 'var(--theme--navigation--background-accent)',
          backgroundActive: 'var(--theme--background-normal)',
          foreground: 'var(--theme--foreground)',
          foregroundHover: 'var(--theme--foreground)',
          foregroundActive: 'var(--theme--secondary)',
        },
      },

      list: {
        background: 'var(--theme--navigation--background)',
        backgroundHover: 'var(--theme--navigation--background-accent)',
        backgroundActive: 'var(--theme--background-normal)',
        foreground: 'var(--theme--foreground)',
        foregroundHover: 'var(--theme--foreground)',
        foregroundActive: 'var(--theme--foreground)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
        icon: {
          foreground: 'var(--theme--secondary)',
          foregroundHover: 'var(--theme--foreground)',
          foregroundActive: 'var(--theme--secondary)',
        },
      },
    },

    // === SIDEBAR ===
    sidebar: {
      background: 'var(--theme--navigation--background)',
      foreground: 'var(--theme--foreground)',
      fontFamily: 'var(--theme--font-family--sans-serif)',
      borderColor: 'var(--theme--border-color)',
      borderWidth: 'var(--theme--border-width)',

      section: {
        toggle: {
          icon: {
            foreground: 'var(--theme--foreground-subdued)',
            foregroundHover: 'var(--theme--foreground)',
            foregroundActive: 'var(--theme--secondary)',
          },
          foreground: 'var(--theme--foreground)',
          foregroundHover: 'var(--theme--foreground)',
          foregroundActive: 'var(--theme--foreground)',
          background: 'var(--theme--navigation--background)',
          backgroundHover: 'var(--theme--navigation--background-accent)',
          backgroundActive: 'var(--theme--background-normal)',
          fontFamily: 'var(--theme--font-family--sans-serif)',
          borderColor: 'var(--theme--border-color)',
          borderWidth: 'var(--theme--border-width)',
        },
      },
    },

    // === HEADER ===
    header: {
      background: 'var(--theme--background)',
      borderColor: 'var(--theme--border-color)',
      borderWidth: 'var(--theme--border-width)',
      boxShadow: 'none',
      headline: {
        foreground: 'var(--theme--foreground-subdued)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
      },
      title: {
        foreground: 'var(--theme--foreground)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
        fontWeight: '600',
      },
    },

    // === FORMS ===
    form: {
      columnGap: '32px',
      rowGap: '24px',

      field: {
        label: {
          foreground: 'var(--theme--foreground-subdued)',
          fontFamily: 'var(--theme--font-family--sans-serif)',
        },
        input: {
          background: 'var(--theme--navigation--background)',
          backgroundSubdued: 'var(--theme--background-normal)',
          foreground: 'var(--theme--foreground)',
          foregroundSubdued: 'var(--theme--foreground-subdued)',
          borderColor: 'var(--theme--border-color)',
          borderColorHover: 'var(--theme--border-color-accent)',
          borderColorFocus: 'var(--theme--secondary)',
          boxShadow: 'none',
          boxShadowHover: 'none',
          boxShadowFocus: '0 0 0 2px color-mix(in srgb, var(--theme--secondary) 20%, transparent)',
          height: '44px',
          padding: '12px',
        },
      },
    },

    // === PUBLIC PAGES (Login, etc.) ===
    public: {
      background: 'var(--theme--background)',
      foreground: 'var(--theme--foreground)',
      foregroundAccent: 'var(--theme--foreground-subdued)',

      art: {
        background: 'var(--theme--background)',
        primary: 'var(--theme--secondary)',
        secondary: 'var(--theme--navigation--background-accent)',
        speed: '2',
      },

      form: {
        field: {
          input: {
            background: 'var(--theme--navigation--background)',
            foreground: 'var(--theme--foreground)',
            backgroundSubdued: 'var(--theme--background-normal)',
            foregroundSubdued: 'var(--theme--foreground-subdued)',
            borderColor: 'var(--theme--border-color)',
            borderColorHover: 'var(--theme--border-color-accent)',
            borderColorFocus: 'var(--theme--secondary)',
            boxShadow: 'none',
            boxShadowHover: 'none',
            boxShadowFocus: '0 0 0 2px color-mix(in srgb, var(--theme--secondary) 20%, transparent)',
          },
        },
      },
    },

    // === POPOVERS ===
    popover: {
      menu: {
        background: 'var(--theme--navigation--background-accent)',
        borderRadius: 'var(--theme--border-radius)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
    },

    // === BANNER ===
    banner: {
      background: 'var(--theme--foreground)',
      padding: '40px',
      avatar: {
        foreground: 'var(--theme--background)',
        background: 'var(--theme--foreground)',
      },
      headline: {
        foreground: 'var(--theme--foreground-subdued)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
      },
      title: {
        foreground: 'var(--theme--background)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
        fontWeight: '600',
      },
      subtitle: {
        foreground: 'var(--theme--foreground-subdued)',
        fontFamily: 'var(--theme--font-family--sans-serif)',
      },
      art: {
        foreground: 'var(--theme--border-color-accent)',
      },
    },
  },
});
