# 🔍 CopyLens（文字捕手）

**对网页上的任何文字进行框选、识别，一键复制**

CopyLens 是一个本地 OCR 浏览器扩展。用户手动框选页面上的文字区域后，插件截取当前可见页面的对应区域，在本地浏览器中完成 OCR 识别，方便复制识别结果。

---

## ⚠️ 重要说明

1. **CopyLens 不绕过登录、会员、付费墙、DRM、验证码或权限限制。**
2. CopyLens 只识别用户当前屏幕上**已经可见**的内容。
3. **OCR 在本地浏览器内运行，不上传图片、截图或网页内容到任何服务器。**

---

## 📋 目录

- [功能特性](#功能特性)
- [百度文库等页面的推荐使用方式](#百度文库等页面的推荐使用方式)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [安装指南](#安装指南)
- [测试页面](#测试页面)
- [OCR 问题排查](#ocr-问题排查)
- [开发](#开发)
- [权限说明](#权限说明)
- [许可证](#许可证)

---

## 功能特性

### ✂️ 框选识别屏幕文字

CopyLens 不依赖网页本身是否支持复制，也不要求文字必须是普通 HTML 文本。对于页面中已经显示出来、但无法直接选中的文字内容，可以通过框选区域的方式尝试识别。

适用场景包括：

- 网页文章、资料页面中的文字
- 在线文档预览中的文字
- PDF 预览页面中的文字
- 图片、截图、扫描件中的文字
- canvas 或特殊渲染层中的文字
- 视频画面中清晰显示的字幕或文字
- 课件、笔记、演示页面中可见的文字

使用方式：

1. 点击 CopyLens 图标。
2. 点击"框选识别屏幕文字"。
3. 扩展截取当前页面可见区域，并在新标签页打开截图。
4. 在截图上拖拽框选要识别的区域。
5. 等待本地 OCR 识别完成。
6. 在识别结果面板中复制文字。

特点：

- 本地 OCR 识别，不上传截图、网页内容或识别结果。
- 支持中文、英文、中英混合识别。
- 自动清理中文字符之间多余空格。
- 支持重新选择区域再次识别。
- 适合学习、阅读、摘录和资料整理场景。

说明：

CopyLens 只处理用户当前屏幕上已经可见的内容。识别效果会受到文字清晰度、字体大小、页面缩放、背景干扰和截图质量等因素影响。对于包含不同字号、表格、多栏排版、页眉页脚的复杂区域，建议缩小框选范围或按段落分次识别。CopyLens 使用本地 OCR，不保证对所有页面、所有文字都能完全准确识别。

---

## 技术栈

| 技术 | 说明 |
|------|------|
| TypeScript | 类型安全的全栈开发语言 |
| Vite 5 | 快速构建工具 |
| Manifest V3 | Chrome 扩展最新清单版本（无 service worker） |
| tesseract.js v5 | 浏览器端 OCR 引擎（本地识别，支持中英文） |
| IndexedDB | 截图数据在 popup 与识别页之间传递 |
| 原生 HTML/CSS/TS | Popup 和识别页（无框架依赖） |

**架构说明：** CopyLens 不依赖 background service worker、content script 或 offscreen document。用户点击 popup 后，扩展直接截取当前标签页可见区域，保存到 IndexedDB，再打开扩展自己的识别页面（selector.html）进行框选和本地 OCR。这种方式避免了部分浏览器（如夸克）对 MV3 service worker 支持不完整导致的注册失败问题。

---

## 项目结构

```
CopyLens/
├── package.json                  # 项目配置和依赖
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置 (popup + selector)
├── README.md                     # 本文件
├── scripts/
│   ├── generate-icons.js         # 图标生成脚本
│   └── download-ocr-data.js      # OCR 语言包下载脚本
├── public/
│   ├── manifest.json             # 扩展清单 (Manifest V3，无 service worker)
│   └── icons/                    # 扩展图标 (16/48/128)
├── popup.html                    # 弹出窗口页面
├── selector.html                 # 截图框选识别页面
├── src/
│   ├── popup/
│   │   ├── popup.ts              # 弹出窗口逻辑（截图 → 保存 → 打开识别页）
│   │   └── popup.css             # 弹出窗口样式
│   ├── selector/
│   │   ├── selector.ts           # 识别页逻辑（框选 → 裁剪 → 本地 OCR）
│   │   └── selector.css          # 识别页样式
│   ├── shared/
│   │   ├── browserApi.ts         # 浏览器 API 封装层
│   │   ├── storage.ts            # 设置存储管理
│   │   ├── indexeddb.ts          # 截图数据 IndexedDB 暂存
│   │   ├── messages.ts           # 消息类型定义（保留，暂未使用）
│   │   └── constants.ts          # 全局常量
│   └── ocr/
│       ├── ocrEngine.ts          # OCR 引擎封装（含文本清洗）
│       └── langdata/             # 语言训练数据 (自动下载)
├── test-pages/
│   └── ocr-test.html             # 功能测试页面
└── dist/                         # 构建输出 (加载此目录到浏览器)
```

---

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装和构建

```bash
cd CopyLens
npm install
npm run build
# 构建产物在 dist/ 目录
# 在浏览器扩展管理页面中加载 dist/ 目录即可
```

---

## 安装指南

### Microsoft Edge

1. 打开 Edge → `edge://extensions`
2. 打开 **"开发人员模式"**
3. 点击 **"加载解压缩的扩展"** → 选择 `CopyLens/dist` 文件夹
4. 如果图标未显示，点击工具栏 🧩 → CopyLens → 👁️

**更新扩展：** 代码更新后运行 `npm run build`，在 `edge://extensions` 中刷新 🔄

### 360 浏览器

360 极速浏览器 / 360 极速浏览器 X 基于 Chromium，理论兼容。

1. 打开 `chrome://extensions`（或 `se://extensions`）
2. 开启 **"开发者模式"**
3. 点击 **"加载已解压的扩展"** → 选择 `CopyLens/dist`

> ⚠️ 需要实测。截图 API 和 Web Worker 可能受限。

### 夸克浏览器

> ⚠️ **已知问题：** 夸克浏览器部分版本对 Manifest V3 Service Worker 支持不完整，CopyLens 在夸克浏览器中可能无法正常注册 Service Worker（Status code: 2），导致扩展无法使用。夸克内置 PDF 阅读器及部分页面中可能出现此问题。建议优先使用 Microsoft Edge 或 Chrome。

1. 尝试 `chrome://extensions` 或 `quark://extensions`
2. 如果能打开扩展管理页面，加载 `CopyLens/dist`
3. 如果 Service Worker 注册失败，当前版本不支持在夸克浏览器中使用

---

## 测试页面

```
test-pages/ocr-test.html
```

包含 Canvas 绘制的文字和图片文字，用于测试框选区域 OCR 功能。

**注意：** 如果用 `file://` 打开，需在 Edge 扩展详情中开启 **"允许访问文件 URL"**。

---

## OCR 问题排查

### 框选识别失败

1. 确认当前页面不是浏览器受保护页面（`chrome://`、`edge://`、扩展管理页等）——这些页面无法截图
2. 如果用 `file://` 打开本地 PDF 或页面，需在扩展详情中开启 **"允许访问文件 URL"**，否则截图会失败
3. 首次识别需加载语言包，可能稍慢，请重试一次
4. 按 F12 打开控制台，查看 `CopyLens` 相关日志

### OCR 识别超时（30 秒）

- 首次加载语言包较慢，重试一次
- 检查网络代理是否阻止了本地 Worker 加载

---

## 开发

```bash
npm run dev          # 开发模式（文件变化自动构建）
npm run build        # 生产构建
npm run build:code   # 仅构建代码
npm run build:icons  # 仅生成图标
```

### 构建输出

```
dist/
├── manifest.json              # 无 background、无 offscreen
├── popup.html                 # 弹出窗口
├── selector.html              # 截图框选识别页
├── assets/
│   ├── popup.js / popup.css
│   ├── selector.js / selector.css
│   └── chunks/
├── ocr/
│   ├── worker.min.js          # tesseract.js Worker
│   ├── tesseract-core.wasm.js / .wasm
│   ├── tesseract-core-simd.wasm.js / .wasm
│   └── langdata/
│       ├── eng.traineddata
│       └── chi_sim.traineddata
└── icons/
```

---

## 权限说明

| 权限 | 用途 | 说明 |
|------|------|------|
| `activeTab` | 获取当前标签页 + 截图 | 仅在用户点击扩展图标时激活。截图仅用于用户主动框选可见区域进行本地 OCR。 |
| `tabs` | 读取当前标签页 URL | 用于检测浏览器受保护页面（如扩展管理页） |
| `storage` | 保存用户设置 | 本地存储，不上传 |

> 不再需要 `scripting`、`offscreen`、`<all_urls>` 等权限。

### 不上传任何数据

- **截图权限仅用于用户主动框选当前可见页面区域并进行本地 OCR 识别**
- OCR 识别完全在浏览器本地完成
- 插件不会上传图片、截图或网页内容到任何服务器

---

## 许可证

MIT License

---

**CopyLens** — 框选屏幕可见文字，本地 OCR 识别复制 🔍
