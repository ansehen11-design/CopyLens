/**
 * CopyLens - Offscreen Document（离屏文档）
 *
 * 运行在扩展自身 chrome-extension:// 环境中，不受目标网页 CSP 限制。
 * 负责：截图裁剪 + Tesseract OCR 识别 + 文本清洗。
 *
 * 只响应 Background Service Worker 发来的 OFFSCREEN_OCR_REQUEST 消息。
 */

import { MESSAGE_TYPES } from '../shared/constants';
import type { OffscreenOcrRequestMessage, OffscreenOcrResultMessage } from '../shared/messages';
import type { OcrLanguage } from '../shared/constants';
import { recognizeImage, cleanOcrText } from '../ocr/ocrEngine';

console.log('CopyLens Offscreen: 初始化完成');

/**
 * 根据选区从截图中裁剪图片（在扩展 DOM 环境中执行）
 */
function cropScreenshot(
  screenshotDataUrl: string,
  rect: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.onload = () => {
      try {
        const scaleX = img.naturalWidth / viewportWidth;
        const scaleY = img.naturalHeight / viewportHeight;

        console.log('CopyLens Offscreen: 截图尺寸 →', img.naturalWidth, '×', img.naturalHeight);
        console.log('CopyLens Offscreen: 视口尺寸 →', viewportWidth, '×', viewportHeight);
        console.log('CopyLens Offscreen: 缩放比例 →', scaleX, '×', scaleY);

        const cropX = Math.round(rect.left * scaleX);
        const cropY = Math.round(rect.top * scaleY);
        const cropW = Math.round(rect.width * scaleX);
        const cropH = Math.round(rect.height * scaleY);

        const safeX = Math.max(0, Math.min(cropX, img.naturalWidth - 1));
        const safeY = Math.max(0, Math.min(cropY, img.naturalHeight - 1));
        const safeW = Math.max(1, Math.min(cropW, img.naturalWidth - safeX));
        const safeH = Math.max(1, Math.min(cropH, img.naturalHeight - safeY));

        const canvas = document.createElement('canvas');
        canvas.width = safeW;
        canvas.height = safeH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }

        ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

        const cropped = canvas.toDataURL('image/png');
        console.log('CopyLens Offscreen: 裁剪完成, 数据长度 →', cropped.length);
        resolve(cropped);
      } catch (error) {
        reject(new Error(`截图裁剪失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };

    img.onerror = () => {
      reject(new Error('截图图片加载失败'));
    };

    img.src = screenshotDataUrl;
  });
}

/**
 * 处理 OCR 请求
 */
async function handleOcrRequest(
  msg: OffscreenOcrRequestMessage
): Promise<OffscreenOcrResultMessage> {
  console.log('CopyLens Offscreen: 收到 OCR 请求, 选区 →', msg.rect, '语言 →', msg.language);

  try {
    // 步骤 1: 裁剪截图
    console.log('CopyLens Offscreen: 裁剪截图开始...');
    const croppedDataUrl = await cropScreenshot(
      msg.screenshotDataUrl,
      msg.rect,
      msg.viewportWidth,
      msg.viewportHeight
    );
    console.log('CopyLens Offscreen: 裁剪截图成功');

    // 步骤 2: OCR 识别
    console.log('CopyLens Offscreen: createWorker 开始 (via recognizeImage)...');
    const rawText = await recognizeImage(croppedDataUrl, msg.language as OcrLanguage);
    console.log('CopyLens Offscreen: OCR 识别成功');

    // 步骤 3: 文本清洗
    const cleanedText = cleanOcrText(rawText, msg.language as OcrLanguage);

    console.log('CopyLens Offscreen: OCR 完成, 文字长度 →', cleanedText.length);
    return {
      type: MESSAGE_TYPES.OFFSCREEN_OCR_RESULT,
      success: true,
      text: cleanedText,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('CopyLens Offscreen: OCR 失败 →', errMsg);
    return {
      type: MESSAGE_TYPES.OFFSCREEN_OCR_RESULT,
      success: false,
      error: `offscreen OCR worker 失败: ${errMsg}`,
    };
  }
}

// 监听来自 Background 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && typeof message === 'object' && message.type === MESSAGE_TYPES.OFFSCREEN_OCR_REQUEST) {
    handleOcrRequest(message as OffscreenOcrRequestMessage)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          type: MESSAGE_TYPES.OFFSCREEN_OCR_RESULT,
          success: false,
          error: err instanceof Error ? err.message : '未知错误',
        } as OffscreenOcrResultMessage)
      );
    return true; // 异步响应
  }
  return false;
});
