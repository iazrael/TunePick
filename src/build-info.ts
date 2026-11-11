/**
 * 构建指纹：构建时由 @nexus-kit/vite 的 nexusPwa 注入，源码里没有可改的值。
 * - APP_VERSION：产品版本，取自 package.json，带 v 前缀
 * - APP_BUILD：构建序号，取自 .build-number，每次构建加 1
 * - APP_NOTES_DIGEST：本版更新说明的指纹，同一版本重新发布时用来判断说明变没变
 */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: number;
declare const __APP_NOTES_DIGEST__: string;

export const APP_VERSION: string = __APP_VERSION__;
export const APP_BUILD: number = __APP_BUILD__;
export const APP_NOTES_DIGEST: string = __APP_NOTES_DIGEST__;
