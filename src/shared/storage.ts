/**
 * CopyLens - 设置存储管理
 */

import { DEFAULT_SETTINGS, STORAGE_KEYS, OcrLanguage } from './constants';
import { getStorage, setStorage } from './browserApi';

export interface CopyLensSettings {
  ocrLanguage: OcrLanguage;
}

export async function getSettings(): Promise<CopyLensSettings> {
  const stored = await getStorage<Partial<CopyLensSettings>>([
    STORAGE_KEYS.OCR_LANGUAGE,
  ]);
  return {
    ocrLanguage: stored.ocrLanguage ?? DEFAULT_SETTINGS.ocrLanguage,
  };
}

export async function updateSetting<K extends keyof CopyLensSettings>(
  key: K,
  value: CopyLensSettings[K]
): Promise<void> {
  const storageKeyMap: Record<keyof CopyLensSettings, string> = {
    ocrLanguage: STORAGE_KEYS.OCR_LANGUAGE,
  };
  await setStorage({ [storageKeyMap[key]]: value });
}
