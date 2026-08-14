/**
 * CopyLens - 截图框选识别页面（无 background service worker 版本）
 *
 * 流程：
 * 1. 从 URL query 读取 screenshotId
 * 2. 从 IndexedDB 按 id 读取截图 Blob
 * 3. URL.createObjectURL 显示整张截图
 * 4. 用户拖拽框选区域
 * 5. 本地 canvas 裁剪 + 预处理
 * 6. 本地 Tesseract OCR 识别
 * 7. 显示结果并提供一键复制
 */

import type { OcrLanguage } from '../shared/constants';
import { loadScreenshotFromIdb, deleteScreenshotFromIdb } from '../shared/indexeddb';
import { recognizeImage } from '../ocr/ocrEngine';

// ========== DOM ==========

const hintBanner = document.getElementById('hintBanner') as HTMLElement;
const loadingNotice = document.getElementById('loadingNotice') as HTMLElement;
const screenshotImage = document.getElementById('screenshotImage') as HTMLImageElement;
const selectionBox = document.getElementById('selectionBox') as HTMLElement;
const resultPanel = document.getElementById('resultPanel') as HTMLElement;
const panelLoading = document.getElementById('panelLoading') as HTMLElement;
const panelResult = document.getElementById('panelResult') as HTMLElement;
const resultTextarea = document.getElementById('resultTextarea') as HTMLTextAreaElement;
const resultError = document.getElementById('resultError') as HTMLElement;
const panelFooter = document.getElementById('panelFooter') as HTMLElement;
const btnCopy = document.getElementById('btnCopy') as HTMLButtonElement;
const btnRetry = document.getElementById('btnRetry') as HTMLButtonElement;
const btnClosePage = document.getElementById('btnClosePage') as HTMLButtonElement;
const panelClose = document.getElementById('panelClose') as HTMLButtonElement;
const closeHint = document.getElementById('closeHint') as HTMLElement;

// ========== 状态 ==========

interface SelectionState {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const selState: SelectionState = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
let isProcessing = false;
let ocrLanguage: OcrLanguage = 'eng+chi_sim';
let lastImageRect: { left: number; top: number; width: number; height: number } | null = null;

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 从 URL 读取 screenshotId
  const params = new URLSearchParams(window.location.search);
  const screenshotId = params.get('screenshotId');
  console.log('CopyLens Selector: [加载] screenshotId =', screenshotId);

  if (!screenshotId) {
    showFatalError('缺少截图 ID，请返回原页面重新框选。');
    return;
  }

  // 2. 三级读取：IndexedDB Blob / IndexedDB ArrayBuffer → session
  const loaded = await loadScreenshotWithFallback(screenshotId);

  if (!loaded) {
    showFatalError('未找到截图数据，请返回原页面重新框选。');
    return;
  }

  ocrLanguage = (loaded.language as OcrLanguage) || 'eng+chi_sim';

  // 3. 用 URL.createObjectURL 显示截图
  const blobUrl = URL.createObjectURL(loaded.blob);
  initWithScreenshot(blobUrl, () => {
    // 图片加载成功后删除暂存截图，释放空间（blobUrl 仍有效）
    deleteScreenshotFromIdb(screenshotId).catch(() => {});
    chrome.storage.session.remove(screenshotId).catch(() => {});
  });
});

/**
 * 依次从 IndexedDB（Blob / ArrayBuffer）和 chrome.storage.session 读取截图
 */
async function loadScreenshotWithFallback(
  screenshotId: string
): Promise<{ blob: Blob; language: string } | null> {
  // Level 1: IndexedDB（Blob 或 ArrayBuffer）
  try {
    const idb = await loadScreenshotFromIdb(screenshotId);
    if (idb) {
      console.log('CopyLens Selector: [加载] ✅ 从 IndexedDB 读取成功, blob.size =', idb.blob.size);
      return idb;
    }
  } catch (err) {
    console.warn('CopyLens Selector: [加载] ⚠️ IndexedDB 读取失败 →', err);
  }

  // Level 2: chrome.storage.session
  try {
    const result = await chrome.storage.session.get(screenshotId);
    const value = result[screenshotId] as { dataUrl?: string; language?: string } | undefined;
    if (value && value.dataUrl) {
      const blob = await (await fetch(value.dataUrl)).blob();
      console.log('CopyLens Selector: [加载] ✅ 从 chrome.storage.session 读取成功, blob.size =', blob.size);
      return { blob, language: value.language || 'eng+chi_sim' };
    }
  } catch (err) {
    console.warn('CopyLens Selector: [加载] ⚠️ chrome.storage.session 读取失败 →', err);
  }

  return null;
}

function initWithScreenshot(blobUrl: string, onLoaded?: () => void): void {
  screenshotImage.src = blobUrl;
  screenshotImage.onload = () => {
    screenshotImage.style.display = 'block';
    loadingNotice.style.display = 'none';
    bindSelectionEvents();
    updateHint('拖拽选择要识别的区域，按 Esc 取消');
    if (onLoaded) onLoaded();
  };
  screenshotImage.onerror = () => {
    showFatalError('截图图片加载失败，请返回原页面重试。');
  };
}

function showFatalError(message: string): void {
  loadingNotice.innerHTML = `
    <div style="color:#e74c3c;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <div>${escapeHtml(message).replace(/\n/g, '<br/>')}</div>
    </div>`;
  loadingNotice.style.marginTop = '20vh';
}

// ========== 框选事件 ==========

function bindSelectionEvents(): void {
  const onMouseDown = (e: MouseEvent) => {
    if (isProcessing || e.button !== 0) return;
    if ((e.target as HTMLElement)?.closest('#resultPanel')) return;

    selState.active = true;
    selState.startX = e.clientX;
    selState.startY = e.clientY;
    selState.endX = e.clientX;
    selState.endY = e.clientY;
    selectionBox.style.display = 'block';
    updateSelectionBox();
    updateHint('正在选择区域... 松开鼠标完成选择');
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!selState.active || isProcessing) return;
    if (selectionBox.style.display === 'none') return;
    selState.endX = e.clientX;
    selState.endY = e.clientY;
    updateSelectionBox();
  };

  const onMouseUp = (_e: MouseEvent) => {
    if (!selState.active || isProcessing) return;
    if (selectionBox.style.display === 'none') return;

    const w = Math.abs(selState.endX - selState.startX);
    const h = Math.abs(selState.endY - selState.startY);

    if (w < 15 || h < 15) {
      selectionBox.style.display = 'none';
      updateHint('选区太小，请重新拖拽选择，按 Esc 取消');
      return;
    }

    selectionBox.style.display = 'none';
    selState.active = false;
    startCropOcr();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (selState.active) {
        selState.active = false;
        selectionBox.style.display = 'none';
        updateHint('已取消。拖拽选择要识别的区域，按 Esc 取消');
      } else if (resultPanel.style.display !== 'none') {
        resetToSelectionMode();
      } else {
        window.close();
      }
    }
  };

  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

function updateSelectionBox(): void {
  const l = Math.min(selState.startX, selState.endX);
  const t = Math.min(selState.startY, selState.endY);
  const w = Math.abs(selState.endX - selState.startX);
  const h = Math.abs(selState.endY - selState.startY);
  selectionBox.style.left = `${l}px`;
  selectionBox.style.top = `${t}px`;
  selectionBox.style.width = `${w}px`;
  selectionBox.style.height = `${h}px`;
}

function getSelectionRect(): { left: number; top: number; width: number; height: number } {
  const l = Math.min(selState.startX, selState.endX);
  const t = Math.min(selState.startY, selState.endY);
  const w = Math.abs(selState.endX - selState.startX);
  const h = Math.abs(selState.endY - selState.startY);
  return { left: l, top: t, width: w, height: h };
}

/**
 * 将视口 CSS 坐标转换为图片像素坐标
 * 图片可能因 CSS max-width:100% 而缩放显示
 */
function viewportToImageCoords(
  vpRect: { left: number; top: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const imgRect = screenshotImage.getBoundingClientRect();
  const scaleX = screenshotImage.naturalWidth / imgRect.width;
  const scaleY = screenshotImage.naturalHeight / imgRect.height;

  return {
    left: Math.round((vpRect.left - imgRect.left) * scaleX),
    top: Math.round((vpRect.top - imgRect.top) * scaleY),
    width: Math.round(vpRect.width * scaleX),
    height: Math.round(vpRect.height * scaleY),
  };
}

// ========== 截图裁剪 + 预处理 ==========

function cropAndPreprocess(
  rect: { left: number; top: number; width: number; height: number }
): string {
  const srcW = screenshotImage.naturalWidth;
  const srcH = screenshotImage.naturalHeight;

  const cropX = Math.max(0, Math.min(rect.left, srcW - 1));
  const cropY = Math.max(0, Math.min(rect.top, srcH - 1));
  const cropW = Math.max(1, Math.min(rect.width, srcW - cropX));
  const cropH = Math.max(1, Math.min(rect.height, srcH - cropY));

  let scale = 1;
  if (cropW < 300 && cropH < 300) {
    scale = 1.5;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建裁剪 Canvas');
  }

  ctx.imageSmoothingEnabled = scale > 1;
  ctx.drawImage(screenshotImage, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrast = 1.3;
    let enhanced = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    enhanced = Math.max(0, Math.min(255, enhanced));
    data[i] = data[i + 1] = data[i + 2] = enhanced;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

// ========== 截图 OCR 流程 ==========

async function startCropOcr(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  const vpRect = getSelectionRect();
  const imgRect = viewportToImageCoords(vpRect);
  lastImageRect = imgRect;

  updateHint('正在识别文字...');
  showPanelLoading();

  try {
    const processedUrl = cropAndPreprocess(imgRect);

    const { text } = await recognizeImage(processedUrl, ocrLanguage, {
      cropWidth: imgRect.width,
      cropHeight: imgRect.height,
    });

    showPanelResult(text || '');
    updateHint('');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('CopyLens Selector: OCR 失败 →', errMsg);
    showPanelError(errMsg);
  } finally {
    isProcessing = false;
  }
}

// ========== 结果面板 ==========

function showPanelLoading(): void {
  resultPanel.style.display = 'flex';
  panelLoading.style.display = 'flex';
  panelResult.style.display = 'none';
  panelFooter.style.display = 'none';
  resultError.style.display = 'none';
  closeHint.style.display = 'none';
}

function showPanelResult(text: string): void {
  resultPanel.style.display = 'flex';
  panelLoading.style.display = 'none';
  panelResult.style.display = 'block';
  resultError.style.display = 'none';
  resultTextarea.style.display = 'block';
  resultTextarea.value = text || '（未识别到文字，请重新框选更清晰的区域。）';
  panelFooter.style.display = 'flex';
  btnCopy.style.display = '';
  closeHint.style.display = 'flex';
}

function showPanelError(message: string): void {
  resultPanel.style.display = 'flex';
  panelLoading.style.display = 'none';
  panelResult.style.display = 'block';
  resultTextarea.style.display = 'none';
  resultError.style.display = 'block';
  resultError.textContent = '❌ ' + message;
  panelFooter.style.display = 'flex';
  btnCopy.style.display = 'none';
  closeHint.style.display = 'flex';
}

function resetToSelectionMode(): void {
  resultPanel.style.display = 'none';
  updateHint('拖拽选择要识别的区域，按 Esc 取消');
}

// ========== 按钮事件 ==========

btnCopy.addEventListener('click', async () => {
  const text = resultTextarea.value;
  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess();
  } catch {
    fallbackCopy(text);
  }
});

btnRetry.addEventListener('click', () => {
  resetToSelectionMode();
  isProcessing = false;
});

panelClose.addEventListener('click', () => {
  resetToSelectionMode();
  isProcessing = false;
});

btnClosePage.addEventListener('click', () => {
  window.close();
});

// ========== 辅助 ==========

function updateHint(text: string): void {
  hintBanner.textContent = text || '拖拽选择要识别的区域，按 Esc 取消';
}

function showCopySuccess(): void {
  const orig = btnCopy.textContent;
  btnCopy.textContent = '✅ 已复制！';
  btnCopy.style.background = '#16a34a';
  btnCopy.style.borderColor = '#16a34a';
  setTimeout(() => { btnCopy.textContent = orig; btnCopy.style.background = ''; btnCopy.style.borderColor = ''; }, 2000);
}

function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); showCopySuccess(); } catch { /* 忽略复制失败 */ }
  document.body.removeChild(ta);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
