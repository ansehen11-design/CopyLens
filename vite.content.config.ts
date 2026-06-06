/**
 * CopyLens - Content Script 专用 Vite 构建配置
 *
 * Manifest V3 的 content_scripts 字段只能加载普通 JS 文件，
 * 不支持 ES module import/export 语法。
 *
 * 此配置将 content script 及其所有依赖（unlockCopy、floatingPanel、
 * ocrImageMode、shared/*、ocrEngine、tesseract.js）打包为单个 IIFE 文件，
 * 输出到 dist/contentScript.js。
 *
 * Popup 和 Background Service Worker 由 vite.config.ts 单独构建。
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    // 不清空 dist，因为 popup/background 已经构建好了
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/contentScript.ts'),
      output: {
        // IIFE = Immediately Invoked Function Expression
        // 打包为自执行函数，无顶层 import/export，可被 content_scripts 直接加载
        format: 'iife',
        entryFileNames: 'contentScript.js',
      },
    },
    // 禁止代码分割
    modulePreload: false,
    // 生成紧凑的 IIFE 而非 ES module
    target: 'es2017',
  },
});
