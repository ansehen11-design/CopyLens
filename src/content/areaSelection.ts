/**
 * CopyLens - 框选区域 OCR（核心功能）
 *
 * Content script 部分：
 * - 框选 UI（遮罩、选区框、提示条）
 * - 将选区坐标发送给 Background，由 Background 通过 Offscreen 完成 OCR
 *
 * Content script 不再直接调用 Tesseract OCR，避免目标网页 CSP 限制。
 */

import type { OcrLanguage } from '../shared/constants';
import { MESSAGE_TYPES } from '../shared/constants';
import {
  showPanel,
  showResult,
  showError,
  showLoading,
  hidePanel,
} from './floatingPanel';
import type { AreaOcrResultMessage } from '../shared/messages';

interface SelectionState {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

let overlayContainer: HTMLDivElement | null = null;
let selectionBox: HTMLDivElement | null = null;
let hintBanner: HTMLDivElement | null = null;

let selectionState: SelectionState = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
let areaOcrLanguage: OcrLanguage = 'eng+chi_sim';
let isProcessing = false;
let lastSelectionRect: { left: number; top: number; width: number; height: number } | null = null;
const cleanupFns: Array<() => void> = [];

// ========== 公共接口 ==========

export function startAreaSelection(language: OcrLanguage): void {
  if (selectionState.active) return;
  areaOcrLanguage = language;
  selectionState.active = true;
  isProcessing = false;
  lastSelectionRect = null;

  console.log('CopyLens Content: 进入框选模式, 语言 →', language);
  createOverlay();
  createHintBanner();
  createSelectionBox();
  bindEvents();
  showHint('拖拽选择要识别的区域，按 Esc 取消');
}

export function cancelAreaSelection(): void {
  if (!selectionState.active) return;
  console.log('CopyLens: 退出框选模式');
  selectionState.active = false;
  cleanup();
}

export function isAreaSelectionActive(): boolean {
  return selectionState.active;
}

export function getOcrLanguage(): OcrLanguage {
  return areaOcrLanguage;
}

function cleanup(): void {
  cleanupFns.forEach((fn) => fn());
  cleanupFns.length = 0;
  if (overlayContainer) { overlayContainer.remove(); overlayContainer = null; }
  if (hintBanner) { hintBanner.remove(); hintBanner = null; }
  selectionBox = null;
  isProcessing = false;
}

// ========== UI ==========

function createOverlay(): void {
  if (overlayContainer) return;
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'copylens-area-overlay';
  overlayContainer.style.cssText = 'position:fixed;inset:0;z-index:2147483640;cursor:crosshair;';
  document.body.appendChild(overlayContainer);
}

function createHintBanner(): void {
  if (hintBanner) return;
  hintBanner = document.createElement('div');
  hintBanner.id = 'copylens-area-hint';
  hintBanner.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:rgba(0,0,0,0.82);color:#fff;padding:10px 24px;border-radius:20px;' +
    'font-size:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
    'font-weight:500;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.25);white-space:nowrap;';
  document.body.appendChild(hintBanner);
}

function createSelectionBox(): void {
  if (selectionBox) selectionBox.remove();
  selectionBox = document.createElement('div');
  selectionBox.id = 'copylens-selection-box';
  selectionBox.style.cssText =
    'position:fixed;z-index:2147483645;border:2px dashed #0066ff;' +
    'background:rgba(0,102,255,0.12);display:none;pointer-events:none;border-radius:2px;';
  document.body.appendChild(selectionBox);
}

function showHint(text: string): void {
  if (hintBanner) { hintBanner.textContent = text; hintBanner.style.opacity = '1'; }
}

function hideHint(): void {
  if (hintBanner) hintBanner.style.opacity = '0';
}

// ========== 事件 ==========

function bindEvents(): void {
  const onMouseDown = (e: MouseEvent) => {
    if (!selectionState.active || isProcessing || e.button !== 0) return;
    if ((e.target as HTMLElement)?.closest('#copylens-floating-panel')) return;
    selectionState.startX = e.clientX;
    selectionState.startY = e.clientY;
    selectionState.endX = e.clientX;
    selectionState.endY = e.clientY;
    if (selectionBox) { selectionBox.style.display = 'block'; updateSelectionBox(); }
    showHint('正在选择区域... 松开鼠标完成选择');
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!selectionState.active || isProcessing) return;
    if (!selectionBox || selectionBox.style.display === 'none') return;
    selectionState.endX = e.clientX;
    selectionState.endY = e.clientY;
    updateSelectionBox();
  };

  const onMouseUp = (_e: MouseEvent) => {
    if (!selectionState.active || isProcessing) return;
    if (!selectionBox || selectionBox.style.display === 'none') return;
    const w = Math.abs(selectionState.endX - selectionState.startX);
    const h = Math.abs(selectionState.endY - selectionState.startY);
    if (w < 20 || h < 20) {
      hideSelectionBox();
      showHint('选区太小，请重新拖拽选择（至少 20×20 像素），按 Esc 取消');
      return;
    }
    if (selectionBox) selectionBox.style.display = 'none';
    startOcrForSelection();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!selectionState.active) return;
    if (e.key === 'Escape') cancelAreaSelection();
  };

  const onSelectStart = (e: Event) => {
    if (selectionState.active) e.preventDefault();
  };

  document.addEventListener('mousedown', onMouseDown, { capture: true });
  document.addEventListener('mousemove', onMouseMove, { capture: true });
  document.addEventListener('mouseup', onMouseUp, { capture: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('selectstart', onSelectStart, { capture: true });

  cleanupFns.push(() => {
    document.removeEventListener('mousedown', onMouseDown, { capture: true });
    document.removeEventListener('mousemove', onMouseMove, { capture: true });
    document.removeEventListener('mouseup', onMouseUp, { capture: true });
    document.removeEventListener('keydown', onKeyDown, { capture: true });
    document.removeEventListener('selectstart', onSelectStart, { capture: true });
  });
}

function updateSelectionBox(): void {
  if (!selectionBox) return;
  const l = Math.min(selectionState.startX, selectionState.endX);
  const t = Math.min(selectionState.startY, selectionState.endY);
  const w = Math.abs(selectionState.endX - selectionState.startX);
  const h = Math.abs(selectionState.endY - selectionState.startY);
  selectionBox.style.left = `${l}px`;
  selectionBox.style.top = `${t}px`;
  selectionBox.style.width = `${w}px`;
  selectionBox.style.height = `${h}px`;
}

function hideSelectionBox(): void {
  if (selectionBox) selectionBox.style.display = 'none';
}

function getSelectionRect(): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.min(selectionState.startX, selectionState.endX),
    top: Math.min(selectionState.startY, selectionState.endY),
    width: Math.abs(selectionState.endX - selectionState.startX),
    height: Math.abs(selectionState.endY - selectionState.startY),
  };
}

// ========== OCR 流程（发送到 Background） ==========

/** 临时隐藏所有框选 UI（避免被截入 OCR 图片） */
function hideAllSelectionUI(): void {
  if (overlayContainer) overlayContainer.style.display = 'none';
  if (selectionBox) selectionBox.style.display = 'none';
  if (hintBanner) hintBanner.style.display = 'none';
  // 同时隐藏浮动面板（如果已存在），避免被截入
  const panel = document.getElementById('copylens-floating-panel');
  if (panel) panel.style.display = 'none';
}

/** 恢复浮动面板可见性 */
function restorePanelVisibility(): void {
  const panel = document.getElementById('copylens-floating-panel');
  if (panel) panel.style.display = '';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 简单的乱码检测：中文模式下中文字符比例过低 */
function isLikelyGarbage(text: string, language: OcrLanguage): boolean {
  if (!text || text.length < 10) return false;
  // 仅对包含中文目标的模式做检测
  if (language === 'eng') return false;

  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const totalAlphaNum = (text.match(/[a-zA-Z0-9]/g) || []).length;
  const meaningfulChars = cjkCount + totalAlphaNum;
  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) return false;

  const meaningfulRatio = meaningfulChars / totalChars;
  // 如果有意义的字符（中文+英文数字）不到 20%，很可能是乱码
  if (meaningfulRatio < 0.2) {
    console.log('CopyLens Area: 疑似乱码 — 有意义字符比例 →', (meaningfulRatio * 100).toFixed(1) + '%');
    return true;
  }
  return false;
}

async function startOcrForSelection(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  const rect = getSelectionRect();
  lastSelectionRect = rect;
  console.log('CopyLens Area: 选区 →', rect);
  showHint('正在截图并识别文字...');

  // 关键：截图前隐藏所有框选 UI，避免被截入 OCR 图片
  hideAllSelectionUI();
  // 等待 150ms 让页面完成重绘
  await delay(150);

  // 大区域提示
  const isLarge = rect.width > window.innerWidth * 0.75 || rect.height > window.innerHeight * 0.5;

  showPanel({
    onCopy: (text) => copyToClipboard(text),
    onRetry: () => retryOcr(),
    onClose: () => { hidePanel(); cancelAreaSelection(); },
  });

  if (isLarge) {
    console.log('CopyLens Area: 大区域框选，识别结果可能不够准确');
    showHint('区域较大，识别中...建议缩小框选范围以获得更准确的结果。');
  }

  try {
    console.log('CopyLens Content: 发送 AREA_OCR_REQUEST 给 background');
    const result = await requestOcrFromBackground(rect, areaOcrLanguage);
    console.log('CopyLens Content: 收到 OCR 结果, 长度 →', result.length);

    // 疑似乱码自动重试一次
    if (isLikelyGarbage(result, areaOcrLanguage)) {
      console.log('CopyLens Area: 首次识别疑似乱码，自动重试...');
      showLoading();
      const retryResult = await requestOcrFromBackground(rect, areaOcrLanguage);
      console.log('CopyLens Content: 重试 OCR 结果, 长度 →', retryResult.length);
      showResult(retryResult);
    } else {
      console.log('CopyLens Content: 准备更新浮动面板');
      showResult(result);
    }

    console.log('CopyLens Panel: showResult 已调用');
    hideHint();
    selectionState.active = false;
    cleanupUIKeepPanel();
    restorePanelVisibility();
    console.log('CopyLens Area: 框选 OCR 完成');
  } catch (error) {
    console.error('CopyLens Area: 框选 OCR 失败', error);
    showError(error instanceof Error ? error.message : '未知错误');
    restorePanelVisibility();
    hideHint();
    selectionState.active = false;
    cleanupUIKeepPanel();
  } finally {
    isProcessing = false;
  }
}

async function retryOcr(): Promise<void> {
  console.log('CopyLens Panel: 点击重新识别');
  if (!lastSelectionRect) {
    console.log('CopyLens Area: 没有 lastSelection，无法重新识别');
    showError('没有可重新识别的区域，请重新框选。');
    return;
  }
  if (isProcessing) return;
  isProcessing = true;

  console.log('CopyLens Area: 使用上一次选区重新识别 →', lastSelectionRect);

  // 截图前隐藏 UI
  hideAllSelectionUI();
  await delay(150);
  // 面板切回 loading
  showLoading();
  restorePanelVisibility();

  try {
    const result = await requestOcrFromBackground(lastSelectionRect, areaOcrLanguage);
    console.log('CopyLens Content: 重新识别结果, 长度 →', result.length);

    if (isLikelyGarbage(result, areaOcrLanguage)) {
      console.log('CopyLens Area: 重新识别结果疑似乱码，再次重试...');
      showLoading();
      const retryResult = await requestOcrFromBackground(lastSelectionRect, areaOcrLanguage);
      showResult(retryResult);
    } else {
      showResult(result);
    }

    console.log('CopyLens Area: 重新识别完成');
    restorePanelVisibility();
  } catch (error) {
    showError(error instanceof Error ? error.message : '未知错误');
    restorePanelVisibility();
  } finally {
    isProcessing = false;
  }
}

function requestOcrFromBackground(
  rect: { left: number; top: number; width: number; height: number },
  language: OcrLanguage
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OCR 请求超时，请重试')), 45000);

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.START_AREA_OCR,
        rect,
        language,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      (response: AreaOcrResultMessage | undefined) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(`OCR 请求失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || 'OCR 识别失败'));
          return;
        }
        resolve(response.text || '');
      }
    );
  });
}

function cleanupUIKeepPanel(): void {
  cleanupFns.forEach((fn) => fn());
  cleanupFns.length = 0;
  if (overlayContainer) { overlayContainer.remove(); overlayContainer = null; }
  if (hintBanner) { hintBanner.remove(); hintBanner = null; }
  if (selectionBox) { selectionBox.remove(); selectionBox = null; }
}

// ========== 复制 ==========

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess();
  } catch {
    fallbackCopy(text);
  }
}

function showCopySuccess(): void {
  const panel = document.getElementById('copylens-floating-panel');
  if (!panel) return;
  const btn = panel.querySelector('.copylens-btn-copy') as HTMLButtonElement;
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = '✅ 已复制！';
  btn.style.background = '#16a34a';
  btn.style.borderColor = '#16a34a';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.style.borderColor = ''; }, 2000);
}

function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); showCopySuccess(); } catch { showError('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}
