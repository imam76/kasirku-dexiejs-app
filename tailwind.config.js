/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      sm: '640px',
      md: '1280px',
      lg: '1280px',
      xl: '1536px',
      '2xl': '1920px',
    },
    extend: {},
  },
  plugins: [],
};
