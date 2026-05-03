import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#dbe7ff',
          500: '#3b6cf5',
          600: '#2a4fd1',
          700: '#1e3aa8',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
