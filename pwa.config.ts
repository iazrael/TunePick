/**
 * PWA 配置的唯一出处：vite.config.ts（构建）和 scripts/verify-build.ts（构建后门禁）共用。
 * 改应用名、运行时缓存分区只改这里。
 */
import type { RuntimePartitionSpec } from '@nexus-kit/vite';

/** 缓存仓名和本地存储键的前缀。上线后不要改。 */
export const APP_ID = 'tunepick';

export const APP_NAME = 'TunePick 吉他调音器';

export const APP_SHORT_NAME = 'TunePick';

/** 界面底色，同时用作 manifest 的主题色和启动画面底色。 */
export const APP_BACKGROUND = '#1f1613';

/** 按需资源的缓存分区。TunePick 的全部资源都随首次安装缓存，没有按需资源。 */
export const RUNTIME_PARTITIONS: RuntimePartitionSpec[] = [];
