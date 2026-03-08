import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        kresco: {
          DEFAULT: '#4D44DB',
          50:  '#EEEDFB',
          100: '#D4D2F6',
          200: '#AAA6EE',
          300: '#7F7AE5',
          400: '#6460DF',
          500: '#4D44DB',
          600: '#3B32C8',
          700: '#2D26A0',
          800: '#201B78',
          900: '#151150',
        },
      },
    },
  },
  plugins: [],
};
export default config;
