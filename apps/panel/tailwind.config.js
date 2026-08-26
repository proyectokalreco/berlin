/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:      '#1A120B',
          navy:      '#241811',
          card:      '#2E1F15',
          teal:      '#D9A652',
          'teal-dk': '#A15F2F',
          coral:     '#FF6B35',
          gold:      '#D9A652',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
