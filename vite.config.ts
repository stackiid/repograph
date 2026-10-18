import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base keeps assets loading from any GitHub Pages subpath
// (https://<user>.github.io/<repo>/) without hardcoding the owner or repo name.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
