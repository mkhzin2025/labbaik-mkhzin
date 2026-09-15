import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const backendTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000'
const backendPaths = [
  '/auth',
  '/users',
  '/organizations',
  '/stores',
  '/integrations',
  '/billing',
  '/channels',
  '/customers',
  '/reviews',
  '/notifications',
  '/flows',
  '/conversations',
  '/webhooks',
  '/api-docs',
  '/api-docs-json',
  '/socket.io',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: Object.fromEntries(
      backendPaths.map((path) => [
        path,
        {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      ]),
    ),
  },
})
