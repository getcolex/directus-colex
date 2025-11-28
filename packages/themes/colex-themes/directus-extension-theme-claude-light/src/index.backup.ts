import { defineTheme } from '@directus/extensions-sdk';

export default defineTheme({
  id: 'claude-light',
  name: 'Claude Light',
  appearance: 'light',
  rules: {
    // === GLOBAL COLORS ===
    background: '#F5F5F0',
    backgroundAccent: '#FFFFFF',
    backgroundNormal: '#E8E8E3',
    backgroundSubdued: '#FAFAF8',

    foreground: '#1A1A1A',
    foregroundAccent: '#2D2D2D',
    foregroundSubdued: '#78716C',

    // === PRIMARY (Dark - matches text for icons/buttons) ===
    primary: '#1A1A1A',
    primaryBackground: 'color-mix(in srgb, #1A1A1A 10%, transparent)',
    primarySubdued: 'color-mix(in srgb, #1A1A1A 50%, #F5F5F0)',
    primaryAccent: '#2D2D2D',

    // === SECONDARY (Burgundy accent) ===
    secondary: '#440D2F',
    secondaryBackground: 'color-mix(in srgb, #440D2F 10%, transparent)',
    secondarySubdued: 'color-mix(in srgb, #440D2F 50%, #F5F5F0)',
    secondaryAccent: '#5C1A3F',

    // === STATUS COLORS ===
    success: '#059669',
    successBackground: 'color-mix(in srgb, #059669 10%, transparent)',
    successSubdued: 'color-mix(in srgb, #059669 50%, #F5F5F0)',
    successAccent: '#10B981',

    warning: '#D97706',
    warningBackground: 'color-mix(in srgb, #D97706 10%, transparent)',
    warningSubdued: 'color-mix(in srgb, #D97706 50%, #F5F5F0)',
    warningAccent: '#F59E0B',

    danger: '#DC2626',
    dangerBackground: 'color-mix(in srgb, #DC2626 10%, transparent)',
    dangerSubdued: 'color-mix(in srgb, #DC2626 50%, #F5F5F0)',
    dangerAccent: '#EF4444',

    // === BORDERS (Sharp corners, warm tones) ===
    borderColor: '#E7E5E4',
    borderColorAccent: '#D6D3D1',
    borderColorSubdued: '#F5F5F4',
    borderRadius: '4px',
    borderWidth: '1px',

    // === FONTS ===
    fontFamily: {
      display: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      sansSerif: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      monospace: '"SF Mono", "Fira Code", monospace',
    },

    // === NAVIGATION (Left module bar) ===
    navigation: {
      background: '#FFFFFF',
      backgroundAccent: '#F5F5F0',
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
          backgroundHover: '#F5F5F0',
          backgroundActive: '#1A1A1A',
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
          backgroundHover: '#F5F5F0',
          backgroundActive: 'rgba(68, 13, 47, 0.08)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderColor: '#E7E5E4',
          borderWidth: '1px',
        },
      },
    },

    // === HEADER ===
    header: {
      background: '#F5F5F0',
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
          backgroundSubdued: '#F5F5F0',
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
      background: '#F5F5F0',
      foreground: '#1A1A1A',
      foregroundAccent: '#78716C',

      art: {
        background: '#F5F5F1',
        primary: '#440D2F',
        secondary: '#1A1A1A',
        speed: '2',
      },

      form: {
        field: {
          input: {
            background: '#FFFFFF',
            foreground: '#1A1A1A',
            backgroundSubdued: '#F5F5F0',
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
  },
});
