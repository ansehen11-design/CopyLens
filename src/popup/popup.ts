/**
 * CopyLens - Popup 页面逻辑
 *
 * 核心功能：框选识别屏幕文字（无 background service worker 版本）
 *
 * 流程（每步都有独立 try/catch + 日志）：
 * 1. 获取 active tab
 * 2. 检查 tab.url 是否为受保护页面
 * 3. chrome.tabs.captureVisibleTab 截图
 * 4. 压缩截图（限制尺寸 + JPEG）
 * 5. 保存截图（IndexedDB Blob → IndexedDB ArrayBuffer → session）
 * 6. 打开 selector.html?screenshotId=xxx
 */

import { DEFAULT_SETTINGS } from '../shared/constants';
import { getSettings, updateSetting } from '../shared/storage';
import type { OcrLanguage } from '../shared/constants';
import { getActiveTab, captureVisibleTab } from '../shared/browserApi';
import { saveScreenshotBlob, saveScreenshotArrayBuffer } from '../shared/indexeddb';

// ========== 压缩参数 ==========

const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.85;

// ========== DOM ==========

const btnAreaSelection = document.getElementById('btnAreaSelection') as HTMLButtonElement;
const ocrLanguageSelect = document.getElementById('ocrLanguage') as HTMLSelectElement;
const pageStatus = document.getElementById('pageStatus') as HTMLElement;
const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
const helpOverlay = document.getElementById('helpOverlay') as HTMLElement;
const helpClose = document.getElementById('helpClose') as HTMLButtonElement;

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSettings();
    await refreshPageStatus();
    setupEventListeners();
  } catch (err) {
    console.error('CopyLens Popup: 初始化失败 →', formatError(err));
    pageStatus.innerHTML = `
      <div class="status-error">
        ⚠️ 初始化失败，请刷新页面后重试
      </div>`;
  }
});

async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    ocrLanguageSelect.value = settings.ocrLanguage;
  } catch (error) {
    console.error('CopyLens Popup: 加载设置失败 →', formatError(error));
    ocrLanguageSelect.value = DEFAULT_SETTINGS.ocrLanguage;
  }
}

// ========== 事件 ==========

function setupEventListeners(): void {
  btnAreaSelection.addEventListener('click', async () => {
    if (btnAreaSelection.disabled) return;

    btnAreaSelection.disabled = true;
    btnAreaSelection.classList.add('loading');

    try {
      const language = ocrLanguageSelect.value as OcrLanguage;
      await updateSetting('ocrLanguage', language);

      // ===== 步骤 1/6: 获取 active tab =====
      let tab: chrome.tabs.Tab;
      try {
        tab = await getActiveTab();
        console.log('CopyLens Popup: [步骤 1/6] ✅ 获取 active tab 成功, tabId =', tab.id);
      } catch (err) {
        console.error('CopyLens Popup: [步骤 1/6] ❌ 获取 active tab 失败 →', formatError(err));
        throw new Error('获取当前标签页失败：' + formatError(err));
      }

      // ===== 步骤 2/6: 检查 tab.url =====
      const url = tab.url || '';
      console.log('CopyLens Popup: [步骤 2/6] 当前 tab.url =', url);
      if (isRestrictedUrl(url)) {
        throw new Error('当前页面不支持截图识别，请切换到普通网页、PDF预览或文档页面后再试。');
      }

      // ===== 步骤 3/6: captureVisibleTab 截图 =====
      let dataUrl: string;
      try {
        dataUrl = await captureVisibleTab();
        console.log('CopyLens Popup: [步骤 3/6] ✅ captureVisibleTab 截图成功');
      } catch (err) {
        console.error('CopyLens Popup: [步骤 3/6] ❌ captureVisibleTab 截图失败 →', formatError(err));
        throw new Error('当前页面截图失败：' + formatError(err));
      }

      // ===== 步骤 4/6: 压缩截图 =====
      console.log('CopyLens Popup: [步骤 4/6] 原始 screenshotDataUrl.length =', dataUrl.length);
      let compressed: { blob: Blob; dataUrl: string; width: number; height: number };
      try {
        const originalBlob = await dataUrlToBlob(dataUrl);
        console.log('CopyLens Popup: [步骤 4/6] 原始 Blob size =', originalBlob.size, 'bytes');

        compressed = await compressScreenshot(dataUrl);
        console.log(
          'CopyLens Popup: [步骤 4/6] ✅ 压缩完成, 压缩后 Blob size =', compressed.blob.size,
          'bytes, 类型 =', compressed.blob.type, ', 尺寸 =', compressed.width, '×', compressed.height
        );
      } catch (err) {
        console.error('CopyLens Popup: [步骤 4/6] ❌ 压缩失败 →', formatError(err));
        throw new Error('截图压缩失败：' + formatError(err));
      }

      // ===== 步骤 5/6: 保存截图（三级回退） =====
      const screenshotId = generateScreenshotId();
      saveScreenshotWithFallback(screenshotId, compressed, language);

      // ===== 步骤 6/6: 打开 selector.html?screenshotId=xxx =====
      try {
        const selectorUrl = chrome.runtime.getURL('selector.html') + '?screenshotId=' + encodeURIComponent(screenshotId);
        console.log('CopyLens Popup: [步骤 6/6] 打开 selector.html →', selectorUrl);
        await chrome.tabs.create({ url: selectorUrl, active: true });
        console.log('CopyLens Popup: [步骤 6/6] ✅ selector.html 已打开');
      } catch (err) {
        console.error('CopyLens Popup: [步骤 6/6] ❌ 打开 selector.html 失败 →', formatError(err));
        throw new Error('打开识别页面失败：' + formatError(err));
      }

      window.close();
    } catch (error) {
      const detail = formatError(error);
      console.error('CopyLens Popup: 截图启动失败 →', detail);
      pageStatus.innerHTML = `
        <div class="status-error">
          ⚠️ ${escapeHtml(detail)}
        </div>`;
      btnAreaSelection.disabled = false;
      btnAreaSelection.classList.remove('loading');
    }
  });

  ocrLanguageSelect.addEventListener('change', async () => {
    const language = ocrLanguageSelect.value as OcrLanguage;
    try {
      await updateSetting('ocrLanguage', language);
    } catch (error) {
      console.error('CopyLens Popup: 设置 OCR 语言失败 →', formatError(error));
    }
  });

  helpBtn.addEventListener('click', () => { helpOverlay.style.display = 'flex'; });
  helpClose.addEventListener('click', () => { helpOverlay.style.display = 'none'; });
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) helpOverlay.style.display = 'none';
  });
}

// ========== 保存截图（三级回退） ==========

/**
 * 保存压缩后的截图，依次尝试：
 * 1. IndexedDB Blob
 * 2. IndexedDB ArrayBuffer
 * 3. chrome.storage.session（压缩后的 dataUrl）
 *
 * 全部失败则抛出明确错误。
 */
async function saveScreenshotWithFallback(
  screenshotId: string,
  compressed: { blob: Blob; dataUrl: string; width: number; height: number },
  language: string
): Promise<void> {
  let saved = false;

  // Level 1: IndexedDB Blob
  try {
    await saveScreenshotBlob({ id: screenshotId, blob: compressed.blob, language });
    saved = true;
    console.log('CopyLens Popup: [步骤 5/6] ✅ IndexedDB 保存 Blob 成功, blob.size =', compressed.blob.size);
  } catch (blobErr) {
    console.warn('CopyLens Popup: [步骤 5/6] ⚠️ IndexedDB Blob 保存失败 →', formatError(blobErr));
  }

  // Level 2: IndexedDB ArrayBuffer
  if (!saved) {
    try {
      const arrayBuffer = await compressed.blob.arrayBuffer();
      await saveScreenshotArrayBuffer({
        id: screenshotId,
        arrayBuffer,
        mimeType: compressed.blob.type,
        language,
      });
      saved = true;
      console.log('CopyLens Popup: [步骤 5/6] ✅ IndexedDB 保存 ArrayBuffer 成功, byteLength =', arrayBuffer.byteLength);
    } catch (abErr) {
      console.warn('CopyLens Popup: [步骤 5/6] ⚠️ IndexedDB ArrayBuffer 保存失败 →', formatError(abErr));
    }
  }

  // Level 3: chrome.storage.session
  if (!saved) {
    try {
      await chrome.storage.session.set({
        [screenshotId]: { dataUrl: compressed.dataUrl, language },
      });
      saved = true;
      console.log('CopyLens Popup: [步骤 5/6] ✅ chrome.storage.session 保存成功, dataUrl.length =', compressed.dataUrl.length);
    } catch (sessionErr) {
      console.error('CopyLens Popup: [步骤 5/6] ❌ chrome.storage.session 保存失败 →', formatError(sessionErr));
    }
  }

  if (!saved) {
    throw new Error(
      '截图保存失败。可能是当前截图过大或浏览器限制了扩展存储。请尝试缩小浏览器窗口、降低页面缩放比例，或框选较小区域后重试。'
    );
  }
}

// ========== 压缩截图 ==========

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('截图图片加载失败'));
    img.src = dataUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * 压缩截图：限制最大尺寸 + JPEG 压缩。
 * 返回压缩后的 Blob（用于 IndexedDB）和 dataUrl（用于 session 回退）。
 */
async function compressScreenshot(
  dataUrl: string
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // 保持比例，限制最大尺寸
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建压缩 Canvas');
  }
  ctx.drawImage(img, 0, 0, width, height);

  // 优先 JPEG
  let blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
  let compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  // JPEG 失败则 fallback PNG
  if (!blob) {
    blob = await canvasToBlob(canvas, 'image/png');
    compressedDataUrl = canvas.toDataURL('image/png');
  }

  if (!blob) {
    throw new Error('截图压缩失败（canvas.toBlob 返回 null）');
  }

  return { blob, dataUrl: compressedDataUrl, width, height };
}

// ========== 页面状态 ==========

async function refreshPageStatus(): Promise<void> {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      pageStatus.innerHTML = `
        <div style="color:#667085;font-size:11px;">
          📸 当前页面不可用，请切换到普通网页或 PDF 页面后再使用 CopyLens。
        </div>`;
      return;
    }
    const url = tab.url || '';

    if (isRestrictedUrl(url)) {
      pageStatus.innerHTML = `
        <div class="status-error">
          ⚠️ 此页面受浏览器保护，扩展功能无法使用。
          <br /><small>（${escapeHtml(url.split('://')[0])}:// 页面）</small>
        </div>`;
      btnAreaSelection.disabled = true;
      btnAreaSelection.style.opacity = '0.5';
      return;
    }

    pageStatus.innerHTML = `
      <div style="color:#667085;font-size:11px;">
        📸 点击上方按钮，截取当前页面并框选识别文字
      </div>`;
  } catch {
    pageStatus.innerHTML = `
      <div class="status-error">
        ⚠️ 无法获取页面状态
        <br /><small>请刷新页面后重试</small>
      </div>`;
  }
}

// ========== 辅助 ==========

function isRestrictedUrl(url: string): boolean {
  return ['chrome://', 'chrome-extension://', 'edge://', 'edge-extension://', 'about:', 'chrome-search://', 'brave://', 'opera://', 'opera-extension://']
    .some((p) => url.startsWith(p));
}

function generateScreenshotId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('转换 dataUrl 失败: HTTP ' + response.status);
  }
  return await response.blob();
}

/**
 * 从任意错误对象中提取 name 和 message
 */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name && err.name !== 'Error' ? err.name + ': ' : '';
    return name + (err.message || '未知错误');
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string };
    if (e.message) {
      const name = e.name ? e.name + ': ' : '';
      return name + e.message;
    }
  }
  return '未知错误';
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
