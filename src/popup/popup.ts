/**
 * CopyLens - Popup 页面逻辑
 *
 * 唯一核心功能：框选识别屏幕文字
 * 保留：OCR 语言选择、OCR 资源检查（高级选项）
 */

import { DEFAULT_SETTINGS, OCR_LANGUAGE_LABELS, MESSAGE_TYPES } from '../shared/constants';
import type {
  StatusResponseMessage,
  SetOcrLanguageMessage,
  StartAreaSelectionMessage,
} from '../shared/messages';
import { getSettings, updateSetting } from '../shared/storage';
import type { OcrLanguage } from '../shared/constants';
import { getActiveTab, sendMessageToActiveTab } from '../shared/browserApi';

// ========== DOM ==========

const btnAreaSelection = document.getElementById('btnAreaSelection') as HTMLButtonElement;
const ocrLanguageSelect = document.getElementById('ocrLanguage') as HTMLSelectElement;
const pageStatus = document.getElementById('pageStatus') as HTMLElement;
const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
const helpOverlay = document.getElementById('helpOverlay') as HTMLElement;
const helpClose = document.getElementById('helpClose') as HTMLButtonElement;

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshPageStatus();
  setupEventListeners();
});

async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    ocrLanguageSelect.value = settings.ocrLanguage;
  } catch (error) {
    console.error('CopyLens Popup: 加载设置失败', error);
    ocrLanguageSelect.value = DEFAULT_SETTINGS.ocrLanguage;
  }
}

// ========== 事件 ==========

function setupEventListeners(): void {
  // 主按钮：框选识别屏幕文字
  btnAreaSelection.addEventListener('click', async () => {
    if (btnAreaSelection.disabled) return;
    btnAreaSelection.disabled = true;
    btnAreaSelection.classList.add('loading');

    try {
      const language = ocrLanguageSelect.value as OcrLanguage;
      await updateSetting('ocrLanguage', language);

      const message: StartAreaSelectionMessage = {
        type: MESSAGE_TYPES.START_AREA_SELECTION,
        language,
      };
      await sendMessageToActiveTab(message);

      setTimeout(() => window.close(), 150);
    } catch (error) {
      console.error('CopyLens Popup: 启动框选模式失败', error);
      btnAreaSelection.disabled = false;
      btnAreaSelection.classList.remove('loading');
      alert(`无法启动框选模式。\n\n${error instanceof Error ? error.message : '未知错误'}`);
    }
  });

  // OCR 语言选择
  ocrLanguageSelect.addEventListener('change', async () => {
    const language = ocrLanguageSelect.value as OcrLanguage;
    try {
      await updateSetting('ocrLanguage', language);
      const message: SetOcrLanguageMessage = {
        type: MESSAGE_TYPES.SET_OCR_LANGUAGE,
        language,
      };
      await sendMessageToActiveTab(message);
    } catch (error) {
      console.error('CopyLens Popup: 设置 OCR 语言失败', error);
    }
  });

  // 帮助
  helpBtn.addEventListener('click', () => { helpOverlay.style.display = 'flex'; });
  helpClose.addEventListener('click', () => { helpOverlay.style.display = 'none'; });
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) helpOverlay.style.display = 'none';
  });

}

// ========== 页面状态 ==========

async function refreshPageStatus(): Promise<void> {
  try {
    const tab = await getActiveTab();
    const url = tab.url || '';

    if (isRestrictedUrl(url)) {
      pageStatus.innerHTML = `
        <div class="status-error">
          ⚠️ 此页面受浏览器保护，扩展功能无法使用。
          <br /><small>（${url.split('://')[0]}:// 页面）</small>
        </div>`;
      btnAreaSelection.disabled = true;
      btnAreaSelection.style.opacity = '0.5';
      return;
    }

    try {
      const status = await sendMessageToActiveTab<StatusResponseMessage>({
        type: MESSAGE_TYPES.GET_STATUS,
      });

      if (status) {
        pageStatus.innerHTML = `
          <div class="status-item">
            <span>OCR语言</span>
            <span>${OCR_LANGUAGE_LABELS[status.ocrLanguage] || status.ocrLanguage}</span>
          </div>
          <div class="status-item" style="margin-top:4px;padding-top:4px;border-top:1px solid #b9e6fe;">
            <span style="font-size:10px;color:#667085;">${escapeHtml(status.pageTitle || '未知页面')}</span>
          </div>`;
      }
    } catch {
      pageStatus.innerHTML = `
        <div style="color:#b42318;font-size:11px;">
          ⚠️ 无法连接到当前页面
          <br /><small>请刷新当前页面后重试</small>
        </div>`;
    }
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
  return ['chrome://','chrome-extension://','edge://','about:','chrome-search://','brave://','opera://']
    .some((p) => url.startsWith(p));
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
