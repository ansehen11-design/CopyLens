/**
 * CopyLens - Background Service Worker
 *
 * Manifest V3 Service Worker:
 * - 管理 Offscreen Document 生命周期
 * - 截图（chrome.tabs.captureVisibleTab）
 * - 路由 OCR 请求：Content Script → Background → Offscreen → 返回结果
 */

import { MESSAGE_TYPES, DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import type {
  StartAreaOcrMessage,
  AreaOcrResultMessage,
  OffscreenOcrRequestMessage,
  OffscreenOcrResultMessage,
  BackgroundMessage,
} from '../shared/messages';
import browser from '../shared/browserApi';

// ========== 扩展生命周期 ==========

browser.runtime.onInstalled.addListener((details) => {
  console.log('CopyLens: 扩展事件 -', details.reason);
  if (details.reason === 'install') {
    browser.storage.local.set({
      [STORAGE_KEYS.OCR_LANGUAGE]: DEFAULT_SETTINGS.ocrLanguage,
    });
    console.log('CopyLens: 已写入默认设置');
  }
  if (details.reason === 'update') {
    console.log('CopyLens: 扩展已更新，版本:', browser.runtime.getManifest().version);
  }
});

// ========== Offscreen 管理 ==========

let creatingOffscreen: Promise<void> | null = null;
const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

async function ensureOffscreen(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error(
      '当前浏览器不支持离屏文档 API（chrome.offscreen）。\n\n' +
      '框选区域 OCR 需要此功能。请使用 Edge 或更新版本的 Chromium 浏览器。'
    );
  }

  // 优先用 getContexts (Chrome 116+)，回退到 hasDocument
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  if (typeof chrome.runtime.getContexts === 'function') {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl],
      } as any);
      if (contexts && contexts.length > 0) {
        console.log('CopyLens BG: offscreen document 已存在');
        return;
      }
    } catch {
      // getContexts 可能抛异常，回退到 hasDocument
    }
  }

  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      console.log('CopyLens BG: offscreen document 已存在 (hasDocument)');
      return;
    }
  } catch {
    // hasDocument 也可能抛异常，继续尝试创建
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  console.log('CopyLens BG: 创建 offscreen document...');
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['DOM_SCRAPING'] as chrome.offscreen.Reason[],
    justification: 'CopyLens: 在扩展自身环境中裁剪截图并运行本地 Tesseract OCR，不受目标网页 CSP 限制。',
  });

  try {
    await creatingOffscreen;
    console.log('CopyLens BG: offscreen document 已创建');
    // 等待 offscreen 的 JS 完成初始化
    await new Promise((r) => setTimeout(r, 500));
  } catch (error) {
    creatingOffscreen = null;
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CopyLens BG: offscreen 创建失败 →', errMsg);
    throw new Error(`offscreen 创建失败: ${errMsg}`);
  } finally {
    creatingOffscreen = null;
  }
}

// ========== 消息路由 ==========

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    sendResponse({ success: false, error: '消息格式无效' });
    return false;
  }

  const msg = message as BackgroundMessage;

  switch (msg.type) {
    case MESSAGE_TYPES.START_AREA_OCR:
      console.log('CopyLens BG: 收到 AREA_OCR_REQUEST');
      handleAreaOcr(msg as unknown as StartAreaOcrMessage)
        .then((result) => {
          console.log('CopyLens BG: OCR 完成, 返回结果给 content script');
          sendResponse(result);
        })
        .catch((err) =>
          sendResponse({
            type: MESSAGE_TYPES.AREA_OCR_RESULT,
            success: false,
            error: err instanceof Error ? err.message : '未知错误',
          } as AreaOcrResultMessage)
        );
      return true; // 异步响应

    default:
      console.warn('CopyLens Background: 收到未知消息类型 →', msg.type);
      sendResponse({ success: false, error: `未知消息类型: ${msg.type}` });
      return false;
  }
});

// ========== 框选区域 OCR 处理 ==========

async function handleAreaOcr(
  msg: StartAreaOcrMessage
): Promise<AreaOcrResultMessage> {
  console.log('CopyLens BG: 收到 AREA_OCR_REQUEST, 选区 →', msg.rect, '语言 →', msg.language);

  // 步骤 1: 截图
  let screenshotDataUrl: string;
  try {
    screenshotDataUrl = await browser.tabs.captureVisibleTab(undefined, { format: 'png' });
    console.log('CopyLens BG: captureVisibleTab 成功, 数据长度 →', screenshotDataUrl.length);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CopyLens BG: 截图失败 →', errMsg);
    return {
      type: MESSAGE_TYPES.AREA_OCR_RESULT,
      success: false,
      error: `background 截图失败: ${errMsg}`,
    };
  }

  // 步骤 2: 确保 Offscreen Document 存在
  try {
    await ensureOffscreen();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      type: MESSAGE_TYPES.AREA_OCR_RESULT,
      success: false,
      error: `offscreen 创建失败: ${errMsg}`,
    };
  }

  // 步骤 3: 发送 OCR 请求到 Offscreen
  console.log('CopyLens BG: 发送 OCR 请求到 offscreen');
  try {
    const ocrResult = await sendToOffscreen({
      type: MESSAGE_TYPES.OFFSCREEN_OCR_REQUEST,
      screenshotDataUrl,
      rect: msg.rect,
      language: msg.language,
      viewportWidth: msg.viewportWidth,
      viewportHeight: msg.viewportHeight,
    });

    console.log('CopyLens BG: 收到 offscreen OCR 结果, success →', ocrResult.success);

    if (!ocrResult.success) {
      return {
        type: MESSAGE_TYPES.AREA_OCR_RESULT,
        success: false,
        error: `offscreen OCR 失败: ${ocrResult.error || '未知错误'}`,
      };
    }

    return {
      type: MESSAGE_TYPES.AREA_OCR_RESULT,
      success: true,
      text: ocrResult.text,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CopyLens BG: offscreen OCR 通信失败 →', errMsg);
    return {
      type: MESSAGE_TYPES.AREA_OCR_RESULT,
      success: false,
      error: `offscreen OCR 通信失败: ${errMsg}`,
    };
  }
}

/**
 * 向 Offscreen Document 发送消息并等待响应
 */
function sendToOffscreen(
  request: OffscreenOcrRequestMessage
): Promise<OffscreenOcrResultMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Offscreen OCR 超时（45 秒），请重试'));
    }, 45000);

    chrome.runtime.sendMessage(request, (response: OffscreenOcrResultMessage | undefined) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(`Offscreen 通信失败: ${chrome.runtime.lastError.message}`));
        return;
      }
      if (!response) {
        reject(new Error('Offscreen 未响应'));
        return;
      }
      resolve(response);
    });
  });
}

console.log('CopyLens: Background Service Worker 已启动');
