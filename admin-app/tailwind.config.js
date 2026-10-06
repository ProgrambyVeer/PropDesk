/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'], mono: ['"JetBrains Mono"', 'monospace'] },
      colors: { navy: { DEFAULT: '#0F172A', 900: '#0A1226', 800: '#1E293B' }, brand: { DEFAULT: '#2563EB', 600: '#1D4ED8', 50: '#EFF6FF', 100: '#DBEAFE' } },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)', lift: '0 10px 30px rgba(15,23,42,.10)' },
      keyframes: { up: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } }, sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } } },
      animation: { up: 'up .35s ease-out both', sheet: 'sheet .28s cubic-bezier(.2,.8,.2,1) both' },
    },
  },
  plugins: [],
};
