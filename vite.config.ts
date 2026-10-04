/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds:
//   default         installable PWA (dist/), e.g. for GitHub Pages
//   --mode artifact one self-contained HTML file (dist-artifact/) for a claude.ai page
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    build: artifact ? { outDir: 'dist-artifact', chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 1200 },
    plugins: [
      react(),
      VitePWA({
        disable: artifact,
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Smart Schedule',
          short_name: 'Schedule',
          description: 'Automatic shift scheduling for retail stores',
          theme_color: '#1f3a5f',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'any',
          start_url: '.',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          // Keep the web fonts for offline use after the first visit.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
      ...(artifact ? [viteSingleFile()] : []),
    ],
    test: { include: ['tests/**/*.test.ts'] },
  };
});
