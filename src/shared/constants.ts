/**
 * CopyLens - 全局常量定义
 */

/** 插件名称 */
export const EXTENSION_NAME = 'CopyLens';

/** Storage 存储键 */
export const STORAGE_KEYS = {
  /** OCR 语言设置 */
  OCR_LANGUAGE: 'ocrLanguage',
} as const;

/** OCR 支持的语言 */
export const OCR_LANGUAGES = {
  ENG: 'eng',
  CHI_SIM: 'chi_sim',
  ENG_CHI_SIM: 'eng+chi_sim',
} as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[keyof typeof OCR_LANGUAGES];

/** OCR 语言显示名称 */
export const OCR_LANGUAGE_LABELS: Record<OcrLanguage, string> = {
  [OCR_LANGUAGES.ENG]: 'English',
  [OCR_LANGUAGES.CHI_SIM]: '简体中文',
  [OCR_LANGUAGES.ENG_CHI_SIM]: 'English + 简体中文',
};

/** 默认设置 */
export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.OCR_LANGUAGE]: OCR_LANGUAGES.ENG_CHI_SIM as OcrLanguage,
};

/** 消息类型 */
export const MESSAGE_TYPES = {
  // Popup → Content Script
  SET_OCR_LANGUAGE: 'SET_OCR_LANGUAGE',
  GET_STATUS: 'GET_STATUS',
  START_AREA_SELECTION: 'START_AREA_SELECTION',

  // Content Script → Popup
  STATUS_RESPONSE: 'STATUS_RESPONSE',

  // Content Script → Background: 框选区域 OCR 请求
  START_AREA_OCR: 'START_AREA_OCR',
  AREA_OCR_RESULT: 'AREA_OCR_RESULT',

  // Background → Offscreen: OCR 请求/响应
  OFFSCREEN_OCR_REQUEST: 'OFFSCREEN_OCR_REQUEST',
  OFFSCREEN_OCR_RESULT: 'OFFSCREEN_OCR_RESULT',

} as const;

/** OCR 识别超时时间（毫秒） */
export const OCR_TIMEOUT_MS = 30_000;
