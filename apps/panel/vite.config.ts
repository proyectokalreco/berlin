import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// App de un solo negocio — un único manifest.json, sin la complejidad
// de manifest-por-ruta que tiene el panel multi-negocio de Kalreco.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // se controla a mano en index.html + public/manifest.json
      includeAssets: [
        'icons/berlin-512.png',
        'icons/berlin-192.png',
        'logos/berlin.png',
        'manifest.json',
      ],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/supabase\.mymulticentro\.com\/storage/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
