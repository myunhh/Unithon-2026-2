import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { parsePublicFrontendConfig } from './src/config.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  parsePublicFrontendConfig(loadEnv(mode, process.cwd(), 'VITE_'))

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
  }
})
