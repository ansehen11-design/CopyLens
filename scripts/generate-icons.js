/**
 * CopyLens - 图标生成脚本
 *
 * 生成简单的 PNG 占位图标（16x16、48x48、128x128）。
 * 使用纯 Node.js Buffer 操作生成有效的 PNG 文件，
 * 无需额外依赖。
 *
 * 图标设计：蓝色圆形背景 + 白色放大镜/镜头图案。
 * 如需要更好的图标，请替换 public/icons/ 目录中的 PNG 文件。
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// 确保目录存在
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

/**
 * 创建 PNG 文件
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {Buffer} pixelData - RGBA 像素数据
 * @returns {Buffer} PNG 文件数据
 */
function createPNG(width, height, pixelData) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData.writeUInt8(8, 8);          // bit depth (8 bits per channel)
  ihdrData.writeUInt8(6, 9);          // color type (RGBA)
  ihdrData.writeUInt8(0, 10);         // compression
  ihdrData.writeUInt8(0, 11);         // filter
  ihdrData.writeUInt8(0, 12);         // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    // Filter byte (0 = None)
    rawData.writeUInt8(0, y * (1 + width * 4));
    // Copy pixel row
    pixelData.copy(
      rawData,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * 创建 PNG chunk
 */
function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * CRC32 校验
 */
function crc32(data) {
  let crc = 0xffffffff;
  const table = crc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _table = null;
function crc32Table() {
  if (_table) return _table;
  _table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _table[i] = c;
  }
  return _table;
}

/**
 * 绘制简单的放大镜图标
 * @param {number} size - 图标尺寸
 * @returns {Buffer} RGBA 像素数据
 */
function drawLensIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0); // 初始透明
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36; // 圆形半径
  const handleWidth = size * 0.12;
  const handleLength = size * 0.3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // 背景圆形（蓝色）
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 稍微缩小圆形以容纳手柄
      const adjustedR = r - size * 0.02;

      if (dist <= adjustedR) {
        // 渐变蓝色圆形背景
        const t = dist / adjustedR;
        const blue = Math.round(30 + (1 - t) * 100);
        pixels[idx] = 0;       // R
        pixels[idx + 1] = Math.round(80 + (1 - t) * 60); // G
        pixels[idx + 2] = Math.round(200 + (1 - t) * 55); // B
        pixels[idx + 3] = 255; // A

        // 内部白色圆（放大镜镜片效果）
        const innerR = adjustedR * 0.62;
        if (dist > innerR - size * 0.04 && dist < innerR + size * 0.05) {
          // 镜片边框
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = Math.round(180 + (1 - Math.abs(dist - innerR) / (size * 0.05)) * 75);
        } else if (dist < innerR - size * 0.02) {
          // 镜片内部（浅色）
          const innerT = dist / (innerR * 0.8);
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = Math.round(40 + innerT * 40);
        }
      }

      // 手柄（从圆形右下方向外延伸）
      const handleStartX = cx + r * 0.6;
      const handleStartY = cy + r * 0.6;
      const handleAngle = Math.PI / 4; // 45度角

      // 计算点到手柄线段的距离
      const hdx = x - handleStartX;
      const hdy = y - handleStartY;
      const proj = hdx * Math.cos(handleAngle) + hdy * Math.sin(handleAngle);

      if (proj > 0 && proj < handleLength) {
        const perpDist = Math.abs(
          -hdx * Math.sin(handleAngle) + hdy * Math.cos(handleAngle)
        );
        if (perpDist < handleWidth / 2) {
          // 手柄颜色
          pixels[idx] = 220;
          pixels[idx + 1] = 230;
          pixels[idx + 2] = 240;
          pixels[idx + 3] = Math.round(200 + (1 - perpDist / (handleWidth / 2)) * 55);
        }
      }
    }
  }

  return pixels;
}

// 生成三种尺寸的图标
const sizes = [16, 48, 128];

for (const size of sizes) {
  const pixels = drawLensIcon(size);
  const pngBuffer = createPNG(size, size, pixels);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  const ws = createWriteStream(filePath);
  ws.write(pngBuffer);
  ws.end();
  console.log(`✅ 已生成图标: icon${size}.png (${size}x${size})`);
}

console.log('🎨 所有图标生成完毕！');
console.log('💡 提示：如需更好的图标效果，请替换 public/icons/ 中的 PNG 文件。');
