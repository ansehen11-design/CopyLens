/**
 * CopyLens - Offscreen Document（离屏文档）
 *
 * 运行在扩展自身 chrome-extension:// 环境中，不受目标网页 CSP 限制。
 * 负责：截图裁剪 + 图像预处理 + Tesseract OCR 识别 + 文本清洗。
 */

import { MESSAGE_TYPES } from '../shared/constants';
import type { OffscreenOcrRequestMessage, OffscreenOcrResultMessage } from '../shared/messages';
import type { OcrLanguage } from '../shared/constants';
import { recognizeImage, cleanOcrText } from '../ocr/ocrEngine';

console.log('CopyLens Offscreen: 初始化完成');

/**
 * 图像预处理：灰度化 + 增强对比度
 * 返回预处理后的 dataURL
 */
function preprocessImageForOcr(
  sourceDataUrl: string,
  cropW: number,
  cropH: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;

        // 如果裁剪区域小于 300px 宽，放大到 1.5x
        let scale = 1;
        if (srcW < 300 && srcH < 300) {
          scale = 1.5;
          console.log('CopyLens Offscreen: 小区域检测，放大至 1.5x');
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('无法创建预处理 Canvas')); return; }

        // 缩放绘制
        ctx.imageSmoothingEnabled = scale > 1; // 放大时开启平滑
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 灰度化 + 对比度增强
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          // 加权灰度
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // 对比度增强：线性拉伸
          const contrast = 1.3;
          let enhanced = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
          enhanced = Math.max(0, Math.min(255, enhanced));
          data[i] = data[i + 1] = data[i + 2] = enhanced;
        }
        ctx.putImageData(imageData, 0, 0);

        const processed = canvas.toDataURL('image/png');
        console.log('CopyLens Offscreen: 预处理完成, 尺寸 →', canvas.width, '×', canvas.height);
        resolve(processed);
      } catch (error) {
        // 预处理失败时回退到原图
        console.warn('CopyLens Offscreen: 预处理失败，使用原图 →', error);
        resolve(sourceDataUrl);
      }
    };
    img.onerror = () => {
      console.warn('CopyLens Offscreen: 预处理图片加载失败，使用原图');
      resolve(sourceDataUrl);
    };
    img.src = sourceDataUrl;
  });
}

/**
 * 根据选区从截图中裁剪图片
 */
function cropScreenshot(
  screenshotDataUrl: string,
  rect: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number
): Promise<{ dataUrl: string; cropW: number; cropH: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.onload = () => {
      try {
        const scaleX = img.naturalWidth / viewportWidth;
        const scaleY = img.naturalHeight / viewportHeight;

        console.log('CopyLens Offscreen: 截图尺寸 →', img.naturalWidth, '×', img.naturalHeight);
        console.log('CopyLens Offscreen: 视口尺寸 →', viewportWidth, '×', viewportHeight);

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
        if (!ctx) { reject(new Error('无法创建 Canvas 上下文')); return; }

        ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

        const cropped = canvas.toDataURL('image/png');
        console.log('CopyLens Offscreen: 裁剪完成 →', safeW, '×', safeH);
        resolve({ dataUrl: cropped, cropW: safeW, cropH: safeH });
      } catch (error) {
        reject(new Error(`截图裁剪失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };

    img.onerror = () => reject(new Error('截图图片加载失败'));
    img.src = screenshotDataUrl;
  });
}

/**
 * 判断是否为"大区域"，需要提示用户
 */
function isLargeArea(rect: { width: number; height: number }, vpW: number, vpH: number): boolean {
  return rect.width > vpW * 0.75 || rect.height > vpH * 0.5;
}

/**
 * 处理 OCR 请求
 */
async function handleOcrRequest(
  msg: OffscreenOcrRequestMessage
): Promise<OffscreenOcrResultMessage> {
  console.log('CopyLens Offscreen: 收到 OCR 请求, 选区 →', msg.rect, '语言 →', msg.language);

  try {
    // 步骤 1: 裁剪
    console.log('CopyLens Offscreen: 裁剪截图开始...');
    const { dataUrl: croppedUrl, cropW, cropH } = await cropScreenshot(
      msg.screenshotDataUrl, msg.rect, msg.viewportWidth, msg.viewportHeight
    );
    console.log('CopyLens Offscreen: 裁剪截图成功');

    // 步骤 2: 图像预处理（灰度 + 对比度 + 小区域放大）
    console.log('CopyLens Offscreen: 图像预处理...');
    const processedUrl = await preprocessImageForOcr(croppedUrl, cropW, cropH);

    // 步骤 3: OCR
    console.log('CopyLens Offscreen: createWorker 开始 (via recognizeImage)...');
    const { text, confidence } = await recognizeImage(processedUrl, msg.language as OcrLanguage, {
      cropWidth: cropW,
      cropHeight: cropH,
      viewportWidth: msg.viewportWidth,
      viewportHeight: msg.viewportHeight,
    });
    console.log('CopyLens Offscreen: OCR 识别成功, 置信度 →', confidence, '%');

    // 步骤 4: 生成提示
    const hints: string[] = [];
    if (isLargeArea(msg.rect, msg.viewportWidth, msg.viewportHeight)) {
      hints.push('当前框选区域较大，识别结果可能不够准确，建议按段落或较小区域分开识别。');
    }
    if (confidence < 60) {
      hints.push(`本次识别置信度较低（${confidence}%），结果可能存在错字。建议缩小框选范围或放大页面后重试。`);
    }
    const hint = hints.length > 0 ? hints.join(' ') : '';

    console.log('CopyLens Offscreen: OCR 完成, 文字长度 →', text.length);
    return {
      type: MESSAGE_TYPES.OFFSCREEN_OCR_RESULT,
      success: true,
      text,
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
    return true;
  }
  return false;
});
