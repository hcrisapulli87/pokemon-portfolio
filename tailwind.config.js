/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0e0b1a',
          surface: '#171227',
          surface2: '#1e1735',
          glass: 'rgba(120,120,140,0.28)',
        },
        holo: {
          cyan: '#67e8f9',
          magenta: '#f472b6',
          gold: '#fbbf24',
          indigo: '#8b7cf6',
        },
      },
      backgroundImage: {
        'holo-gradient': 'linear-gradient(135deg,#67e8f9,#8b7cf6,#f472b6,#fbbf24)',
        'holo-cta': 'linear-gradient(90deg,#67e8f9,#8b7cf6)',
      },
    },
  },
  plugins: [],
}

