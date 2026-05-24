/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        dark: {
          bg:      '#09090F',
          surface: '#101018',
          card:    '#14141C',
          border:  '#252535',
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.35s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'scan':       'scanline 2.5s linear infinite',
        'blink':      'blink 1.1s step-end infinite',
      },
      keyframes: {
        fadeIn:   { '0%':{ opacity:'0' },         '100%':{ opacity:'1' } },
        slideUp:  { '0%':{ transform:'translateY(16px)', opacity:'0' }, '100%':{ transform:'translateY(0)', opacity:'1' } },
        scanline: { '0%':{ top:'-2px' },          '100%':{ top:'100%' } },
        blink:    { '0%,100%':{ opacity:'1' },    '50%':{ opacity:'0' } },
      },
    },
  },
  plugins: [],
}
