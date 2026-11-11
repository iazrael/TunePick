import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

const BACKGROUND = '#1f1613';

export default defineConfig({
  // 相对路径：部署在 GitHub Pages 的子目录或自定义域名下都能用
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'TunePick 吉他调音器',
        short_name: 'TunePick',
        description: '打开就能用的吉他调音器，琴声只在本机处理。',
        lang: 'zh-CN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: BACKGROUND,
        background_color: BACKGROUND,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
