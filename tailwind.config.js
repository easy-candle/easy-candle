/** @param {string} name */
function scale(name) {
  return {
    50: `rgb(var(--${name}-50) / <alpha-value>)`,
    100: `rgb(var(--${name}-100) / <alpha-value>)`,
    200: `rgb(var(--${name}-200) / <alpha-value>)`,
    300: `rgb(var(--${name}-300) / <alpha-value>)`,
    400: `rgb(var(--${name}-400) / <alpha-value>)`,
    500: `rgb(var(--${name}-500) / <alpha-value>)`,
    600: `rgb(var(--${name}-600) / <alpha-value>)`,
    700: `rgb(var(--${name}-700) / <alpha-value>)`,
    800: `rgb(var(--${name}-800) / <alpha-value>)`,
    900: `rgb(var(--${name}-900) / <alpha-value>)`,
    950: `rgb(var(--${name}-950) / <alpha-value>)`
  }
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        zinc: scale('zinc'),
        amber: scale('amber'),
        red: scale('red'),
        emerald: scale('emerald'),
        sky: scale('sky')
      }
    }
  },
  plugins: []
}
