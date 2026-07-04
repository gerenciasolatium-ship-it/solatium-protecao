/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'sol-azul': 'rgb(var(--sol-azul) / <alpha-value>)',
        'sol-verde': 'rgb(var(--sol-verde) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
