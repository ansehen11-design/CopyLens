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
        // 复制图标文件
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
        // popup HTML 作为入口
        popup: resolve(__dirname, 'popup.html'),
        // selector 页面（截图框选识别页面）
        selector: resolve(__dirname, 'selector.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          switch (chunkInfo.name) {
            case 'popup':
              return 'assets/popup.js';
            case 'selector':
              return 'assets/selector.js';
            default:
              return 'assets/[name]-[hash].js';
          }
        },
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'popup.css') {
            return 'assets/popup.css';
          }
          if (assetInfo.name === 'selector.css') {
            return 'assets/selector.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    modulePreload: false,
  },
});
