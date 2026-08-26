import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// App de un solo negocio — un único manifest.json, sin la complejidad
// de manifest-por-ruta que tiene el panel multi-negocio de Kalreco.
//
// base:'/login/' — Fase 3: la landing pública vive en "/", el panel vive
// en "/login/" (mismo dominio, nginx separa por ese prefijo). Todos los
// assets (JS/CSS/íconos) del panel se sirven bajo /login/ para no pisar
// los archivos propios de la landing (que usa las mismas rutas /logos,
// /icons con SU PROPIA copia de los mismos nombres de archivo).
export default defineConfig({
  base: '/login/',
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
