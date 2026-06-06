import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        // 复制 manifest.json 到 dist 根目录
        {
          src: 'public/manifest.json',
          dest: '.',
        },
        // 复制图标文件（如果存在）
        {
          src: 'public/icons/*.png',
          dest: 'icons',
        },
        // 复制 tesseract.js worker 文件
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: 'ocr',
        },
        // 复制 tesseract.js-core WASM 引擎文件（JS 封装 + 原始 WASM）
        {
          src: 'node_modules/tesseract.js-core/tesseract-core.wasm.js',
          dest: 'ocr',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core.wasm',
          dest: 'ocr',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js',
          dest: 'ocr',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-simd.wasm',
          dest: 'ocr',
        },
        // 复制已下载的语言数据
        {
          src: 'src/ocr/langdata/*.traineddata',
          dest: 'ocr/langdata',
        },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // popup HTML 作为入口（Vite 会处理 HTML 并注入正确的 script 引用）
        popup: resolve(__dirname, 'src/popup/popup.html'),
        // background service worker
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
        // offscreen document（OCR 离屏处理）
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
      output: {
        // 自定义输出文件名以匹配 manifest.json 中的路径
        entryFileNames: (chunkInfo) => {
          switch (chunkInfo.name) {
            case 'background':
              return 'background.js';
            case 'contentScript':
              return 'contentScript.js';
            case 'popup':
              return 'assets/popup.js';
            case 'offscreen':
              return 'assets/offscreen.js';
            default:
              return 'assets/[name]-[hash].js';
          }
        },
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // popup.css 放到 assets 目录
          if (assetInfo.name === 'popup.css') {
            return 'assets/popup.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // 禁止代码分割以减少文件数量
    modulePreload: false,
  },
});
