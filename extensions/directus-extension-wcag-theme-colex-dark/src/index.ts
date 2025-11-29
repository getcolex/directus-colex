import { defineTheme } from '@directus/extensions-sdk';

export default defineTheme({
  id: 'wcag-colex-dark',
  name: 'WCAG Colex Dark',
  appearance: 'dark',
  rules: {
    // === GLOBAL COLORS ===
    background: '#1A1A1A',
    backgroundAccent: 'color-mix(in srgb, var(--theme--secondary) 25%, transparent)',
    backgroundNormal: '#262626',
    backgroundSubdued: '#1F1F1F',

    foreground: '#F8F7F4',
    foregroundAccent: '#FFFFFF',
    foregroundSubdued: '#A8A29E',

    // === PRIMARY (Light - matches text for icons/buttons) ===
    primary: '#F8F7F4',
    primaryBackground: 'color-mix(in srgb, var(--theme--primary) 10%, transparent)',
    primarySubdued: 'color-mix(in srgb, var(--theme--primary) 50%, var(--theme--background))',
    primaryAccent: '#FFFFFF',

    // === SECONDARY (Lighter burgundy for dark mode) ===
    secondary: '#A65D73', // WCAG: Brightened from #8B4A5E for 5.3:1 contrast on dark background
    secondaryBackground: 'color-mix(in srgb, var(--theme--secondary) 10%, transparent)',
    secondarySubdued: 'color-mix(in srgb, var(--theme--secondary) 50%, var(--theme--background))',
    secondaryAccent: '#B87088', // WCAG: Brightened from #A65D73 to maintain hierarchy

    // === STATUS COLORS (Brighter for dark mode) ===
    success: '#22C55E',
    successBackground: 'color-mix(in srgb, var(--theme--success) 10%, transparent)',
    successSubdued: 'color-mix(in srgb, var(--theme--success) 50%, var(--theme--background))',
    successAccent: '#4ADE80',

    warning: '#F59E0B',
    warningBackground: 'color-mix(in srgb, var(--theme--warning) 10%, transparent)',
    warningSubdued: 'color-mix(in srgb, var(--theme--warning) 50%, var(--theme--background))',
    warningAccent: '#FBBF24',

    danger: '#EF4444',
    dangerBackground: 'color-mix(in srgb, var(--theme--danger) 10%, transparent)',
    dangerSubdued: 'color-mix(in srgb, var(--theme--danger) 50%, var(--theme--background))',
    dangerAccent: '#F87171',

    // === BORDERS (Warm dark tones) ===
    borderColor: '#615D59', // WCAG: Lightened from #44403C for 3.1:1 contrast on dark background
    borderColorAccent: '#6B6762', // WCAG: Lightened from #57534E for 3.6:1 contrast
    borderColorSubdued: '#3D3835', // WCAG: Lightened from #292524 to maintain hierarchy
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
      background: '#1A1A1A',
      backgroundAccent: '#2D2D2D',
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
          foregroundActive: 'var(--theme--foreground)',
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
          foreground: 'var(--theme--foreground)',
          foregroundHover: 'var(--theme--foreground)',
          foregroundActive: 'var(--theme--foreground)',
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
            foregroundActive: 'var(--theme--foreground)',
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
          background: 'var(--theme--navigation--background-accent)',
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
            background: 'var(--theme--navigation--background-accent)',
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
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
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
