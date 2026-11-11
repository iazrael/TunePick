/** 构建后门禁（pnpm build 的第二步）：检查 PWA 壳、升级链和体积预算。预算超了先查原因，再决定要不要调数。 */
import { verifyPwaBuild } from '@nexus-kit/vite';
import { APP_ID, APP_NAME, RUNTIME_PARTITIONS } from '../pwa.config.ts';

const report = verifyPwaBuild({
  root: new URL('..', import.meta.url).pathname,
  appId: APP_ID,
  manifestName: APP_NAME,
  runtimePartitions: RUNTIME_PARTITIONS,
  budgets: { precacheKB: 300, criticalKB: 100 },
});
console.log(
  `[verify-build] v${report.version} build ${report.build}：预缓存 ${report.precacheEntries} 条 ${report.precacheKB}KB，首屏关键路径（压缩后）${report.criticalKB}KB`,
);
