/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cores da marca Solatium — controladas por variáveis CSS em src/index.css,
        // fáceis de trocar sem recompilar o Tailwind.
        'sol-azul': 'rgb(var(--sol-azul) / <alpha-value>)',
        'sol-verde': 'rgb(var(--sol-verde) / <alpha-value>)',
      },
      maxWidth: {
        app: '30rem',
      },
    },
  },
  plugins: [],
};
