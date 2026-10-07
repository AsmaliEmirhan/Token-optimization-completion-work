/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          dark: '#071A3D',
          DEFAULT: '#0A2558',
          deep: '#123CBA',
        },
        blue: {
          electric: '#1677FF',
          accent: '#248BFF',
          light: '#40BFFF',
          pale: '#EEF5FF',
          ice: '#F0F7FF',
        },
        cyan: {
          accent: '#29D9FF',
          soft: '#E0F7FA',
        },
        offwhite: {
          DEFAULT: '#F7F5EF',
          card: '#FAF9F5',
          subtle: '#FCFBF8',
          hover: '#EFECE3',
          border: '#E8E5DC',
        },
        muted: {
          blue: '#596E8A',
          gray: '#8695A8',
          light: '#94A3B8',
        },
        dark: {
          bg: '#08090B',
          surface: '#0B0D10',
          sidebar: '#101216',
          card: '#14171C',
          hover: '#191D23',
          input: '#111419',
          text: '#F4F4F5',
          secondary: '#9299A6',
          muted: '#68707D',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.12)',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '30px',
        '5xl': '36px',
      },
      boxShadow: {
        'soft-frame': '0 20px 50px -12px rgba(7, 26, 61, 0.08), 0 0 1px 1px rgba(7, 26, 61, 0.03)',
        'soft-card': '0 4px 16px -2px rgba(7, 26, 61, 0.04), 0 1px 3px rgba(7, 26, 61, 0.02)',
        'soft-card-hover': '0 12px 28px -6px rgba(7, 26, 61, 0.08), 0 2px 6px rgba(7, 26, 61, 0.03)',
        'sidebar': '0 8px 30px -4px rgba(7, 26, 61, 0.04), 0 0 1px 1px rgba(22, 119, 255, 0.02)',
        'input-glow': '0 16px 40px -10px rgba(7, 26, 61, 0.07), 0 0 20px -2px rgba(22, 119, 255, 0.08)',
        'button-blue': '0 6px 18px -3px rgba(22, 119, 255, 0.35)',
      },
      animation: {
        'spin-slow': 'spin 16s linear infinite',
        'spin-reverse': 'spin-reverse 20s linear infinite',
        'pulse-subtle': 'pulse-subtle 4s ease-in-out infinite',
      },
      keyframes: {
        'spin-reverse': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(-360deg)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
      }
    },
  },
  plugins: [],
}
