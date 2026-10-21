import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B1F3A',
          50: '#F2F5F9',
          100: '#E2E8F0',
          700: '#13304F',
          800: '#0E2744',
          900: '#0B1F3A',
          950: '#07162A',
        },
        orange: {
          DEFAULT: '#F26B1D',
          50: '#FEF3EA',
          100: '#FDE3CF',
          500: '#F26B1D',
          600: '#DB5A12',
          700: '#B4480E',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(11, 31, 58, 0.25)',
      },
    },
  },
  plugins: [],
}

export default config
