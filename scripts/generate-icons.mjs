// 从 public/favicon.svg 生成 PWA 需要的 PNG 图标。改了图标后运行：npm run icons
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const source = new URL('../public/favicon.svg', import.meta.url);
const outDir = new URL('../public/icons/', import.meta.url);

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

await mkdir(outDir, { recursive: true });
for (const [name, size] of targets) {
  await sharp(source.pathname, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(new URL(name, outDir).pathname);
  console.log(`${name} ${size}×${size}`);
}
