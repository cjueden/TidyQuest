import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const { version } = JSON.parse(readFileSync('../package.json', 'utf-8'))

// Which build this is: set by the Docker build ("main · 7e18930", empty for releases); for local
// builds, the git branch and commit when git is around
function buildLabel(): string {
  if (process.env.APP_BUILD !== undefined) return process.env.APP_BUILD
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim() + ' · ' + execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(buildLabel()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
