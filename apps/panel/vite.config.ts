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
      // 'prompt': una versión nueva NO recarga la app sola en medio de una venta; un aviso deja
      // al usuario elegir cuándo actualizar (ver components/PwaUpdateBanner.tsx).
      registerType: 'prompt',
      manifest: false, // se controla a mano en index.html + public/manifest.json
      includeAssets: [
        'icons/berlin-512.png',
        'icons/berlin-192.png',
        'logos/berlin.png',
        'manifest.json',
      ],
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Tipografías de Google: con caché, la app se ve igual sin conexión
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
  // Identifica la compilación: la copia local de datos de otra versión se descarta (cacheLocal.ts)
  define: { __APP_BUILD__: JSON.stringify(Date.now().toString(36)) },
  build: { outDir: 'dist', sourcemap: false },
})
