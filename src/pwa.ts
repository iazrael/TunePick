/**
 * PWA 控制器：整个应用只创建这一个。Service Worker 的注册、新版本检测和升级都经过它。
 * 机制见 docs/架构算法/离线与升级.md。
 */
import { createPwaController } from '@nexus-kit/pwa';
import { registerSW } from 'virtual:pwa-register';
import { APP_ID } from '../pwa.config';
import { APP_BUILD, APP_NOTES_DIGEST, APP_VERSION } from './build-info';

export const pwa = createPwaController({
  local: { version: APP_VERSION, build: APP_BUILD, notesDigest: APP_NOTES_DIGEST },
  registerSW,
  storagePrefix: APP_ID,
  // 控制器默认从域名根目录取 version.json；这里部署在子目录，改成相对页面的路径
  versionUrl: `${import.meta.env.BASE_URL}version.json`,
});
