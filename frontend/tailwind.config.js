/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-void': '#0A0A07',
        'panel': '#12120C',
        'line': '#262316',
        'accent-amber': '#C9A227',
        'signal-green': '#7FB86B',
        'alert': '#E85D4C',
        'text-primary': '#E8E4D4',
        'text-dim': '#8A8672',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' }, // scroll half because we duplicated the array
        }
      },
      animation: {
        marquee: 'marquee linear infinite',
      }
    },
  },
  plugins: [],
}
