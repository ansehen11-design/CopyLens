/**
 * CopyLens - OCR 语言数据下载脚本
 *
 * 从 tesseract-ocr/tessdata 仓库下载训练好的语言数据文件。
 * 下载后的文件存放在 src/ocr/langdata/ 目录，
 * 构建时会被复制到 dist/ocr/langdata/。
 *
 * 下载的语言包：
 * - eng.traineddata (~4.2 MB) - 英文
 * - chi_sim.traineddata (~2.5 MB) - 简体中文
 *
 * 数据来源：https://github.com/tesseract-ocr/tessdata_fast
 *
 * 注意：此脚本在 npm run build 时自动运行。
 * 如果文件已存在且大小正确，则跳过下载。
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 语言数据存放目录 */
const langDataDir = path.join(__dirname, '..', 'src', 'ocr', 'langdata');

/** 需要下载的语言数据 */
const LANGUAGES = [
  {
    code: 'eng',
    filename: 'eng.traineddata',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    /** 预期最小大小（字节），用于校验 */
    minSize: 1_500_000,
  },
  {
    code: 'chi_sim',
    filename: 'chi_sim.traineddata',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata',
    minSize: 1_000_000,
  },
];

// 确保目录存在
if (!existsSync(langDataDir)) {
  mkdirSync(langDataDir, { recursive: true });
}

/**
 * 下载单个文件
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`  ⬇️  正在下载: ${url}`);

    const file = createWriteStream(destPath);
    let downloadedSize = 0;
    let lastLogTime = Date.now();

    get(url, { timeout: 60000 }, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`下载失败: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        // 每秒输出一次进度
        const now = Date.now();
        if (now - lastLogTime > 1000 && totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r    进度: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
          lastLogTime = now;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        if (totalSize > 0) {
          process.stdout.write('\r    进度: 100.0%\n');
        }
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    }).on('timeout', () => {
      file.close();
      reject(new Error('下载超时'));
    });
  });
}

/**
 * 检查文件是否已存在且有效
 */
function isFileValid(filePath, minSize) {
  if (!existsSync(filePath)) return false;
  try {
    const stats = statSync(filePath);
    return stats.size >= minSize;
  } catch {
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('📦 CopyLens: 下载 OCR 语言数据...\n');

  let allSkipped = true;

  for (const lang of LANGUAGES) {
    const destPath = path.join(langDataDir, lang.filename);

    if (isFileValid(destPath, lang.minSize)) {
      const stats = statSync(destPath);
      console.log(`  ✅ ${lang.filename} 已存在 (${(stats.size / 1024 / 1024).toFixed(1)} MB)，跳过下载`);
      continue;
    }

    allSkipped = false;
    console.log(`  📥 下载 ${lang.code} 语言包 (${lang.filename})...`);

    try {
      await downloadFile(lang.url, destPath);
      const stats = statSync(destPath);
      console.log(`  ✅ ${lang.filename} 下载完成 (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (error) {
      console.error(`  ❌ ${lang.filename} 下载失败:`, error.message);
      console.log(`  💡 提示：你可以手动下载语言包：`);
      console.log(`     ${lang.url}`);
      console.log(`     保存到: ${destPath}`);
    }
  }

  if (allSkipped) {
    console.log('\n✨ 所有语言数据已就绪，无需下载。');
  } else {
    console.log('\n✨ 语言数据下载完毕！');
  }

  console.log(`\n📁 语言数据存放路径: ${langDataDir}`);
  console.log('💡 构建时这些文件将被复制到 dist/ocr/langdata/ 目录。');
}

main().catch((error) => {
  console.error('❌ 下载过程出错:', error.message);
  console.log('💡 你可以稍后运行 npm run download-ocr-data 重新下载。');
  // 不阻止后续构建（如 vite build）
  process.exit(0);
});
