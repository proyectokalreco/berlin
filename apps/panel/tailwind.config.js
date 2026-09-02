/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:      '#1C1A18',
          navy:      '#2C2925',
          card:      '#403A32',
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
