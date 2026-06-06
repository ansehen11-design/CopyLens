/**
 * CopyLens - OCR 引擎封装
 *
 * 基于 tesseract.js v5，在浏览器本地完成 OCR 识别。
 * 所有资源（worker、wasm、语言包）均从扩展本地资源目录加载，
 * 不上传任何数据到服务器。
 *
 * 注意：此模块在 content script 中运行，
 * 通过 chrome.runtime.getURL 获取扩展内的 OCR 资源文件。
 */

import Tesseract, { type Worker, type RecognizeResult } from 'tesseract.js';
import type { OcrLanguage } from '../shared/constants';
import { OCR_LANGUAGES, OCR_TIMEOUT_MS } from '../shared/constants';

/** OCR 引擎配置 */
export interface OcrEngineConfig {
  /** 扩展本地 OCR 资源的基础路径（相对于扩展根目录，如 "ocr"） */
  ocrBasePath?: string;
}

/** OCR 资源检查结果 */
export interface OcrAssetStatus {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** 当前 worker 实例 */
let worker: Worker | null = null;
let currentLanguage: string | null = null;

/**
 * 获取扩展内的 OCR 资源路径
 * 使用 chrome.runtime.getURL 获取扩展内文件的绝对 URL
 *
 * langPath 特殊处理：确保以 / 结尾，否则 tesseract.js 拼接 traineddata
 * 文件名时会出错（URL 构造函数会丢弃最后一段路径）。
 */
function getOcrPath(relativePath: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const url = chrome.runtime.getURL(`ocr/${relativePath}`);
    return url;
  }
  // 开发环境 fallback（file:// 协议）
  const fallback = `/ocr/${relativePath}`;
  console.warn(`CopyLens OCR: chrome.runtime.getURL 不可用，使用 fallback → ${fallback}`);
  return fallback;
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`OCR ${label}超时 (${timeoutMs / 1000}秒)。请检查 worker/wasm/语言包路径，或尝试使用框选区域 OCR。`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * 检查单个 OCR 资源是否可访问
 * 使用 GET 请求（非 HEAD），因为某些扩展资源可能不支持 HEAD
 */
async function checkSingleAsset(name: string, url: string): Promise<OcrAssetStatus> {
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
    const ok = response.ok;
    console.log(`CopyLens OCR Check: ${ok ? '✅' : '❌'} ${name} → ${url} (HTTP ${response.status})`);
    return { name, url, ok, status: response.status };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`CopyLens OCR Check: ❌ ${name} → ${url} (${errMsg})`);
    return { name, url, ok: false, error: errMsg };
  }
}

/**
 * 检查所有 OCR 资源是否可访问
 *
 * 在 OCR 初始化前调用，帮助排查资源路径问题。
 * 如果任何资源不可访问，返回详细的错误信息。
 */
export async function checkOcrAssets(): Promise<{
  allOk: boolean;
  results: OcrAssetStatus[];
  workerPath: string;
  corePath: string;
  langPath: string;
  engUrl: string;
  chiSimUrl: string;
}> {
  const workerPath = getOcrPath('worker.min.js');
  const corePathSIMD = getOcrPath('tesseract-core-simd.wasm.js');
  const corePathStd = getOcrPath('tesseract-core.wasm.js');
  const coreWasmSIMD = getOcrPath('tesseract-core-simd.wasm');
  const coreWasmStd = getOcrPath('tesseract-core.wasm');
  const langPath = getOcrPath('langdata') + '/'; // 确保以 / 结尾
  const engUrl = langPath + 'eng.traineddata';
  const chiSimUrl = langPath + 'chi_sim.traineddata';

  console.log('CopyLens OCR: ===== 资源检查开始 =====');
  console.log('CopyLens OCR: workerPath       →', workerPath);
  console.log('CopyLens OCR: corePath (SIMD)  →', corePathSIMD);
  console.log('CopyLens OCR: corePath (标准)   →', corePathStd);
  console.log('CopyLens OCR: core WASM (SIMD) →', coreWasmSIMD);
  console.log('CopyLens OCR: core WASM (标准)  →', coreWasmStd);
  console.log('CopyLens OCR: langPath         →', langPath);
  console.log('CopyLens OCR: eng URL          →', engUrl);
  console.log('CopyLens OCR: chi_sim URL      →', chiSimUrl);

  const results = await Promise.all([
    checkSingleAsset('worker.min.js', workerPath),
    checkSingleAsset('tesseract-core-simd.wasm.js', corePathSIMD),
    checkSingleAsset('tesseract-core.wasm.js', corePathStd),
    checkSingleAsset('tesseract-core-simd.wasm', coreWasmSIMD),
    checkSingleAsset('tesseract-core.wasm', coreWasmStd),
    checkSingleAsset('eng.traineddata', engUrl),
    checkSingleAsset('chi_sim.traineddata', chiSimUrl),
  ]);

  const allOk = results.every((r) => r.ok);

  if (allOk) {
    console.log('CopyLens OCR: ===== 所有资源可访问 ✅ =====');
  } else {
    const failed = results.filter((r) => !r.ok);
    console.error('CopyLens OCR: ===== 以下资源不可访问 ❌ =====');
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.url}${f.status ? ` (HTTP ${f.status})` : ''}${f.error ? ` (${f.error})` : ''}`);
    }
  }

  return { allOk, results, workerPath, corePath: corePathSIMD, langPath, engUrl, chiSimUrl };
}

/**
 * 初始化 OCR Worker
 *
 * @param language OCR 语言设置
 * @param config 引擎可选配置
 * @returns 就绪的 Worker 实例
 */
export async function initWorker(
  language: OcrLanguage,
  config?: OcrEngineConfig
): Promise<Worker> {
  // 如果已有 worker 且语言相同，直接复用
  if (worker && currentLanguage === language) {
    console.log('CopyLens OCR: 复用现有 Worker');
    return worker;
  }

  // 如果语言不同，先销毁旧的
  if (worker) {
    console.log('CopyLens OCR: 语言变更，销毁旧 Worker');
    await terminateWorker();
  }

  const langCode = convertToTesseractLang(language);
  const workerPath = getOcrPath('worker.min.js');
  const corePathSIMD = getOcrPath('tesseract-core-simd.wasm.js');
  const corePathStd = getOcrPath('tesseract-core.wasm.js');
  // 关键：langPath 必须以 / 结尾，否则 tesseract.js 会用 URL 构造函数
  // 解析 traineddata 路径时丢弃最后一段路径
  const langPath = getOcrPath('langdata') + '/';

  console.log('CopyLens OCR: ===== 初始化开始 =====');
  console.log('CopyLens OCR: workerPath       →', workerPath);
  console.log('CopyLens OCR: corePath (SIMD)  →', corePathSIMD);
  console.log('CopyLens OCR: corePath (标准)   →', corePathStd);
  console.log('CopyLens OCR: langPath         →', langPath);
  console.log('CopyLens OCR: eng URL          →', langPath + 'eng.traineddata');
  console.log('CopyLens OCR: chi_sim URL      →', langPath + 'chi_sim.traineddata');
  console.log('CopyLens OCR: 当前语言          →', langCode);

  // 先检查资源可访问性（仅记录，不阻断；让 tesseract 给出真实错误）
  const assetCheck = await checkOcrAssets();
  if (!assetCheck.allOk) {
    console.warn('CopyLens OCR: ⚠️ 部分资源 fetch 检查失败，但仍将尝试初始化 Worker...');
    const failedList = assetCheck.results
      .filter((r) => !r.ok)
      .map((r) => `  - ${r.name}: ${r.error || `HTTP ${r.status}`}`)
      .join('\n');
    console.warn('CopyLens OCR: 未通过检查的资源:\n' + failedList);
  }

  // 尝试 SIMD 版本
  try {
    console.log('CopyLens OCR: Worker 创建开始 (SIMD)...');
    worker = await withTimeout(
      Tesseract.createWorker(langCode, 1, {
        workerPath,
        corePath: corePathSIMD,
        langPath,
        cachePath: undefined,
        gzip: false,
        workerBlobURL: false,  // 关键: 直接用 workerPath 创建 Worker, 不用 blob URL
      }),
      OCR_TIMEOUT_MS,
      'Worker 初始化'
    );

    currentLanguage = language;
    console.log('CopyLens OCR: ===== Worker 初始化成功 (SIMD) =====');
    console.log('CopyLens OCR: Worker 创建成功, 语言加载成功');
    return worker;
  } catch (error) {
    const simdErr = error instanceof Error ? error.message : String(error);
    console.warn('CopyLens OCR: SIMD WASM 加载失败 →', simdErr);
    console.warn('CopyLens OCR: 尝试回退到标准版本...');

    // 回退到非 SIMD 版本
    try {
      console.log('CopyLens OCR: Worker 创建开始（标准版本）...');
      worker = await withTimeout(
        Tesseract.createWorker(langCode, 1, {
          workerPath,
          corePath: corePathStd,
          langPath,
          cachePath: undefined,
          gzip: false,
          workerBlobURL: false,  // 关键: 直接用 workerPath 创建 Worker, 不用 blob URL
        }),
        OCR_TIMEOUT_MS,
        'Worker 初始化'
      );

      currentLanguage = language;
      console.log('CopyLens OCR: ===== Worker 初始化成功（标准版本）=====');
      console.log('CopyLens OCR: Worker 创建成功, 语言加载成功');
      return worker;
    } catch (fallbackError) {
      const errMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error('CopyLens OCR: ===== Worker 初始化失败 =====');
      console.error('CopyLens OCR: createWorker 错误详情 →', errMsg);
      console.error('CopyLens OCR: 请检查以下路径:');
      console.error('  • workerPath:', workerPath);
      console.error('  • corePath (SIMD):', corePathSIMD);
      console.error('  • corePath (标准):', corePathStd);
      console.error('  • langPath:', langPath);
      console.error('  • eng URL:', langPath + 'eng.traineddata');
      console.error('  • chi_sim URL:', langPath + 'chi_sim.traineddata');
      if (simdErr) console.error('  • SIMD 尝试错误:', simdErr);

      throw new Error(
        `OCR 引擎初始化失败: ${errMsg}\n\n请检查:\n• worker/wasm/语言包路径\n• 语言包是否存在于 dist/ocr/langdata/\n• web_accessible_resources 配置\n• 控制台日志中是否有 404 错误`
      );
    }
  }
}

/**
 * OCR 文本后处理：清洗识别结果
 *
 * - 中文场景：删除中文字符之间多余空格
 * - 中文标点前后多余空格清理
 * - 英文场景：仅 trim、压缩空行，保留单词间空格
 *
 * @param rawText OCR 原始文本
 * @param language 当前 OCR 语言
 * @returns 清洗后的文本
 */
export function cleanOcrText(rawText: string, language: OcrLanguage): string {
  if (!rawText) return rawText;

  let text = rawText;

  // 是否包含中文（简体、繁体、扩展区）
  const hasChinese = /[一-鿿㐀-䶿豈-﫿]/.test(text);

  if (hasChinese) {
    // 删除中文字符之间的空格
    // 例如 "人 工 智 能" → "人工智能"
    text = text.replace(/([一-鿿㐀-䶿豈-﫿])\s+([一-鿿㐀-䶿豈-﫿])/g, '$1$2');

    // 删除中文标点前面的空格
    // ，。！？；：、）》】】》」』"'
    text = text.replace(/\s+([，。！？；：、）》】」』"'.。,;:!?)\]}$)])/g, '$1');

    // 删除中文标点后面的多余空格（但保留后跟英文/数字前的合理空格）
    text = text.replace(/([，。！？；：、）》】」』"'《【「『])\s+(?=[一-鿿㐀-䶿豈-﫿])/g, '$1');
  }

  // 通用处理：trim 首尾空白
  text = text.trim();

  // 压缩连续空行（3 个以上换行 → 最多 2 个换行，即一个空行）
  text = text.replace(/\n{3,}/g, '\n\n');

  // 压缩行内连续空格（3 个以上 → 2 个）
  text = text.replace(/[^\S\n]{3,}/g, '  ');

  // 去除明显的 OCR 噪声行（仅含符号、短横线、单个字符的短行）
  const lines = text.split('\n');
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true; // 保留空行
    if (trimmed.length <= 2 && /^[\s\p{P}\p{S}]+$/u.test(trimmed)) return false; // 纯标点短行
    if (trimmed.length <= 8 && /^[-=_—─•·.•]+$/.test(trimmed)) return false; // 装饰线
    return true;
  });
  text = cleaned.join('\n');

  // 去除连续重复标点（3 个以上相同标点 → 1 个）
  text = text.replace(/([，。！？；：、])\1{2,}/g, '$1');
  text = text.replace(/([.,!?;:])\1{2,}/g, '$1');

  if (hasChinese && rawText !== text) {
    console.log('CopyLens OCR: cleanOcrText 已清理中文空格');
    console.log('CopyLens OCR: 原始长度 →', rawText.length, '清洗后长度 →', text.length);
  }

  return text;
}

/** OCR 识别选项 */
export interface RecognizeOptions {
  /** 裁剪区域 CSS 像素宽度，用于 PSM 选择 */
  cropWidth?: number;
  cropHeight?: number;
  /** 视口尺寸 */
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * 根据裁剪区域大小选择合适的 Tesseract PSM（页面分割模式）
 * - 小块文字区域 → PSM 6（单段均匀文字块）
 * - 大块复杂区域 → PSM 11（稀疏文字）
 */
function selectPsm(cropWidth: number, cropHeight: number): number {
  const area = cropWidth * cropHeight;
  if (area < 80000) return 6;   // 小区域：单段文字
  if (area < 250000) return 3;  // 中等区域：全自动
  return 11;                     // 大区域：稀疏文字
}

/**
 * 对图片执行 OCR 识别
 */
export async function recognizeImage(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  language: OcrLanguage,
  options?: RecognizeOptions
): Promise<{ text: string; confidence: number }> {
  console.log('CopyLens OCR: ===== 识别开始 =====');
  console.log('CopyLens OCR: 图片来源类型 →',
    typeof imageSource === 'string'
      ? (imageSource.startsWith('data:') ? 'dataURL' : 'URL')
      : imageSource.constructor.name
  );

  const w = await initWorker(language);

  try {
    // 根据裁剪区域选择 PSM
    const psm = options?.cropWidth
      ? selectPsm(options.cropWidth, options.cropHeight || options.cropWidth)
      : 3;
    console.log(`CopyLens OCR: PSM → ${psm} (crop: ${options?.cropWidth || 'N/A'}×${options?.cropHeight || 'N/A'})`);

    // 设置 Tesseract 参数
    await w.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
    });

    const result: RecognizeResult = await withTimeout(
      w.recognize(imageSource),
      OCR_TIMEOUT_MS,
      '识别'
    );

    const rawText = result.data.text.trim();
    const confidence = result.data.confidence || 0;
    console.log(`CopyLens OCR: ===== 识别成功 =====`);
    console.log(`CopyLens OCR: 原始文字长度 → ${rawText.length}, 平均置信度 → ${confidence}%`);
    if (rawText.length > 0 && rawText.length < 200) {
      console.log('CopyLens OCR: 原始识别结果 →', rawText);
    }

    // 后处理：清洗中文空格等
    const cleanedText = cleanOcrText(rawText, language);
    console.log(`CopyLens OCR: 清洗后文字长度 → ${cleanedText.length} 个字符`);
    return { text: cleanedText, confidence };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CopyLens OCR: ===== 识别失败 =====');
    console.error('CopyLens OCR: 错误详情 →', errMsg);
    throw new Error(`OCR 识别失败: ${errMsg}`);
  }
}

/**
 * 终止 OCR Worker，释放资源
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
      console.log('CopyLens OCR: Worker 已终止');
    } catch (error) {
      console.warn('CopyLens OCR: Worker 终止时出错', error);
    }
    worker = null;
    currentLanguage = null;
  }
}

/**
 * 检查 OCR Worker 是否就绪
 */
export function isWorkerReady(): boolean {
  return worker !== null;
}

/**
 * 将 CopyLens 的语言设置转换为 tesseract 语言代码
 */
export function convertToTesseractLang(language: OcrLanguage): string {
  switch (language) {
    case OCR_LANGUAGES.ENG:
      return 'eng';
    case OCR_LANGUAGES.CHI_SIM:
      return 'chi_sim';
    case OCR_LANGUAGES.ENG_CHI_SIM:
      return 'eng+chi_sim';
    default:
      return 'eng+chi_sim';
  }
}
