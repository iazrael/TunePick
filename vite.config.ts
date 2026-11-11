import { nexusPwa } from '@nexus-kit/vite';
import { defineConfig } from 'vitest/config';
import { APP_BACKGROUND, APP_ID, APP_NAME, APP_SHORT_NAME, RUNTIME_PARTITIONS } from './pwa.config.ts';

export default defineConfig(({ command }) => ({
  // 相对路径：部署在 GitHub Pages 的子目录或自定义域名下都能用
  base: './',
  plugins: [
    // PWA 的唯一入口：版本注入、version.json、manifest 和 Service Worker 都由它生成
    nexusPwa({
      command,
      appId: APP_ID,
      root: import.meta.dirname,
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: '打开就能用的吉他调音器，琴声只在本机处理。',
        // 插件默认按部署在域名根目录写 start_url；这里部署在子目录，改成相对路径
        start_url: '.',
        scope: '.',
        theme_color: APP_BACKGROUND,
        background_color: APP_BACKGROUND,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      runtimePartitions: RUNTIME_PARTITIONS,
      precache: {
        globPatterns: ['assets/*.woff2'],
        includeAssets: ['favicon.svg'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
