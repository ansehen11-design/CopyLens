/**
 * CopyLens - Content Script 主入口
 *
 * 负责：
 * 1. 初始化：读取 OCR 语言设置
 * 2. 消息路由：处理来自 popup 的命令
 * 3. 协调 areaSelection 模块
 */

import { MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';
import type {
  ExtensionMessage,
  SetOcrLanguageMessage,
  StartAreaSelectionMessage,
  StatusResponseMessage,
} from '../shared/messages';
import type { OcrLanguage } from '../shared/constants';
import { getStorage } from '../shared/browserApi';
import { startAreaSelection } from './areaSelection';

// ========== 状态 ==========

/** 当前 OCR 语言 */
let ocrLanguage: OcrLanguage = DEFAULT_SETTINGS.ocrLanguage as OcrLanguage;

// ========== 初始化 ==========

async function initialize(): Promise<void> {
  console.log('CopyLens: Content Script 初始化...');
  try {
    const settings = await getStorage<Record<string, unknown>>([
      STORAGE_KEYS.OCR_LANGUAGE,
    ]);
    ocrLanguage =
      (settings[STORAGE_KEYS.OCR_LANGUAGE] as OcrLanguage) ??
      (DEFAULT_SETTINGS.ocrLanguage as OcrLanguage);
    console.log('CopyLens: 初始化完成, OCR 语言 →', ocrLanguage);
  } catch (error) {
    console.error('CopyLens: 初始化失败', error);
  }
}

// ========== 消息处理 ==========

function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean | void {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    sendResponse({ success: false, error: '消息格式无效' });
    return;
  }

  switch (message.type) {
    case MESSAGE_TYPES.SET_OCR_LANGUAGE:
      ocrLanguage = (message as SetOcrLanguageMessage).language;
      sendResponse({ success: true });
      break;

    case MESSAGE_TYPES.GET_STATUS:
      sendResponse({
        type: MESSAGE_TYPES.STATUS_RESPONSE,
        ocrLanguage,
        pageUrl: window.location.href,
        pageTitle: document.title,
      } as StatusResponseMessage);
      return true;

    case MESSAGE_TYPES.START_AREA_SELECTION:
      startAreaSelection((message as StartAreaSelectionMessage).language);
      sendResponse({ success: true });
      break;

    default:
      console.warn('CopyLens Content: 收到未知消息类型 →', (message as ExtensionMessage).type);
      sendResponse({ success: false, error: `未知消息类型: ${(message as ExtensionMessage).type}` });
      break;
  }
}

// ========== 启动 ==========

chrome.runtime.onMessage.addListener(handleMessage);
initialize();
console.log('CopyLens: Content Script 已加载');
