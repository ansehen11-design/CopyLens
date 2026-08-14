/**
 * CopyLens - 消息类型定义
 */

import { MESSAGE_TYPES, OcrLanguage } from './constants';

// ========== Popup → Content Script ==========

export interface SetOcrLanguageMessage {
  type: typeof MESSAGE_TYPES.SET_OCR_LANGUAGE;
  language: OcrLanguage;
}

export interface GetStatusMessage {
  type: typeof MESSAGE_TYPES.GET_STATUS;
}

export interface StartAreaSelectionMessage {
  type: typeof MESSAGE_TYPES.START_AREA_SELECTION;
  language: OcrLanguage;
}

// ========== Content Script → Popup ==========

export interface StatusResponseMessage {
  type: typeof MESSAGE_TYPES.STATUS_RESPONSE;
  ocrLanguage: OcrLanguage;
  pageUrl: string;
  pageTitle: string;
}

// ========== Content Script → Background ==========

/** 框选区域 OCR 请求（content script → background） */
export interface StartAreaOcrMessage {
  type: typeof MESSAGE_TYPES.START_AREA_OCR;
  /** 选区在 CSS 像素中的位置（相对视口） */
  rect: { left: number; top: number; width: number; height: number };
  language: OcrLanguage;
  /** 页面视口 CSS 像素尺寸 */
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

/** 框选区域 OCR 结果（background → content script） */
export interface AreaOcrResultMessage {
  type: typeof MESSAGE_TYPES.AREA_OCR_RESULT;
  success: boolean;
  text?: string;
  error?: string;
}

// ========== Background ↔ Offscreen ==========

/** 发送给 offscreen 的 OCR 请求 */
export interface OffscreenOcrRequestMessage {
  type: typeof MESSAGE_TYPES.OFFSCREEN_OCR_REQUEST;
  screenshotDataUrl: string;
  rect: { left: number; top: number; width: number; height: number };
  language: OcrLanguage;
  viewportWidth: number;
  viewportHeight: number;
}

/** offscreen 返回的 OCR 结果 */
export interface OffscreenOcrResultMessage {
  type: typeof MESSAGE_TYPES.OFFSCREEN_OCR_RESULT;
  success: boolean;
  text?: string;
  error?: string;
}

// ========== Popup → Background (截图选择模式) ==========

export interface StartScreenshotSelectionMessage {
  type: typeof MESSAGE_TYPES.START_SCREENSHOT_SELECTION;
  language: OcrLanguage;
}

// ========== 注入脚本 ↔ Background (Tier 1 fallback) ==========

export interface InjectedSelectionDoneMessage {
  type: typeof MESSAGE_TYPES.INJECTED_SELECTION_DONE;
  rect: { left: number; top: number; width: number; height: number };
  viewportWidth: number;
  viewportHeight: number;
}

export interface InjectedOcrResultMessage {
  type: typeof MESSAGE_TYPES.INJECTED_OCR_RESULT;
  success: boolean;
  text?: string;
  error?: string;
}

// ========== Selector 页面 ↔ Background (Tier 2 fallback) ==========

export interface SelectorReadyMessage {
  type: typeof MESSAGE_TYPES.SELECTOR_READY;
}

export interface SelectorInitMessage {
  type: typeof MESSAGE_TYPES.SELECTOR_INIT;
  screenshotDataUrl: string;
  language: OcrLanguage;
}

export interface SelectorCropOcrMessage {
  type: typeof MESSAGE_TYPES.SELECTOR_CROP_OCR;
  /** 图片像素座标（非 viewport CSS 像素） */
  rect: { left: number; top: number; width: number; height: number };
  /** 截图原始宽度（用于 offscreen 裁剪座标换算） */
  imageWidth: number;
  /** 截图原始高度 */
  imageHeight: number;
}

export interface SelectorOcrResultMessage {
  type: typeof MESSAGE_TYPES.SELECTOR_OCR_RESULT;
  success: boolean;
  text?: string;
  error?: string;
}

// ========== 联合类型 ==========

/** content script 接收的消息 */
export type ExtensionMessage =
  | SetOcrLanguageMessage
  | GetStatusMessage
  | StartAreaSelectionMessage;

/** background 接收的消息 */
export type BackgroundMessage =
  | StartAreaOcrMessage
  | StartScreenshotSelectionMessage
  | SelectorReadyMessage
  | SelectorCropOcrMessage
  | InjectedSelectionDoneMessage;

/** offscreen 接收的消息 */
export type OffscreenMessage = OffscreenOcrRequestMessage;
