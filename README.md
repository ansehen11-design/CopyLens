# 🔍 CopyLens

**浏览器本地 OCR 辅助插件：框选屏幕上可见的文字区域，本地识别并一键复制**

CopyLens 是一个 Chromium 系浏览器扩展，用于识别当前网页上用户可见的文字区域。

适用于：
- 百度文库（canvas/图片渲染文字）
- PDF 预览
- 在线文档预览
- 图片文字
- Canvas 渲染文字
- 其他无法直接选中的屏幕文字

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

### ✂️ 框选区域 OCR（主功能）

**目标：只要用户在浏览器页面上能看见文字，就可以手动框选该区域进行 OCR 识别。**

- 点击 CopyLens → 点击"框选识别屏幕文字"
- 在网页上拖拽鼠标框选要识别的区域
- 插件自动截图当前可见页面、裁剪对应区域，进行本地 OCR
- 识别结果显示在浮动面板中，支持一键复制
- 自动清理中文空格，保留英文单词正常间距
- **完全本地识别**，不上传截图或识别内容到任何服务器

### 🖼️ 图片 OCR（次功能）

适合普通 `<img>` 标签的图片。开启后鼠标悬停图片显示蓝色高亮边框，点击即可识别。

**注意：** 如果图片 OCR 一直 loading、识别失败，或页面内容不是 `img` 标签，请使用**框选区域 OCR**。

---

## 百度文库等页面的推荐使用方式

1. 打开百度文库文档页面
2. 点击浏览器工具栏的 **CopyLens 图标**
3. 点击 **"框选识别屏幕文字"** 按钮
4. 在文档正文区域**拖拽框选**要识别的文字
5. 等待 OCR 识别（首次使用需要加载语言包，可能稍慢）
6. 在右下角浮动面板查看结果 → 点击 **"复制到剪贴板"**

---

## 技术栈

| 技术 | 说明 |
|------|------|
| TypeScript | 类型安全的全栈开发语言 |
| Vite 5 | 快速构建工具 |
| Manifest V3 | Chrome 扩展最新清单版本 |
| tesseract.js v5 | 浏览器端 OCR 引擎（本地识别，支持中英文） |
| 原生 HTML/CSS/TS | Popup 和浮动面板（无框架依赖） |

---

## 项目结构

```
CopyLens/
├── package.json                  # 项目配置和依赖
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置 (popup + background)
├── vite.content.config.ts        # Vite 构建配置 (content script IIFE)
├── README.md                     # 本文件
├── scripts/
│   ├── generate-icons.js         # 图标生成脚本
│   └── download-ocr-data.js      # OCR 语言包下载脚本
├── public/
│   ├── manifest.json             # 扩展清单 (Manifest V3)
│   └── icons/                    # 扩展图标 (16/48/128)
├── src/
│   ├── background/
│   │   └── serviceWorker.ts      # Service Worker (截图、消息路由)
│   ├── content/
│   │   ├── contentScript.ts      # Content Script 主入口
│   │   ├── areaSelection.ts      # 框选区域 OCR（核心功能）
│   │   ├── ocrImageMode.ts       # 图片 OCR 交互模块
│   │   ├── floatingPanel.ts      # OCR 结果浮动面板
│   │   └── contentStyle.css      # 注入样式
│   ├── popup/
│   │   ├── popup.html            # 弹出窗口页面
│   │   ├── popup.ts              # 弹出窗口逻辑
│   │   └── popup.css             # 弹出窗口样式
│   ├── shared/
│   │   ├── browserApi.ts         # 浏览器 API 封装层
│   │   ├── storage.ts            # 设置存储管理
│   │   ├── messages.ts           # 消息类型定义
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

夸克浏览器电脑版的扩展支持有限，需要实测。

1. 尝试 `chrome://extensions` 或 `quark://extensions`
2. 如果能打开扩展管理页面，加载 `CopyLens/dist`
3. 如果无法打开，当前版本不支持扩展管理

> ⚠️ `chrome.tabs.captureVisibleTab` 和 Web Worker 可能不可用。

---

## 测试页面

```
test-pages/ocr-test.html
```

包含 Canvas 绘制的文字和图片文字，用于测试框选区域 OCR 和图片 OCR。

**注意：** 如果用 `file://` 打开，需在 Edge 扩展详情中开启 **"允许访问文件 URL"**。

---

## OCR 问题排查

### 图片 OCR 一直 loading

1. 打开 F12 Console，查看 `CopyLens OCR` 日志
2. 确认 `workerPath`、`corePath`、`langPath` 的 URL 正确
3. 确认 `dist/ocr/langdata/` 下有语言包文件
4. 尝试改用**框选区域 OCR**

### 框选区域 OCR 失败

1. 确认已授予截图权限
2. 确认当前页面不是受保护页面（`chrome://`、`edge://` 等）
3. 用 `file://` 时需开启"允许访问文件 URL"
4. 查看控制台 `CopyLens Area` 和 `CopyLens OCR` 日志

### OCR 识别超时（30 秒）

- 首次加载语言包较慢，重试一次
- 检查网络代理是否阻止了本地 Worker 加载

### 检查 OCR 资源

打开 popup → 展开 **"⚙️ 高级选项"** → 点击 **"🔧 检查 OCR 资源"**，可快速验证所有 OCR 文件是否可访问。

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
├── manifest.json
├── background.js              # Service Worker
├── contentScript.js           # Content Script (IIFE)
├── src/popup/popup.html       # 弹出窗口
├── assets/
│   ├── popup.js / popup.css
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
| `scripting` | Content Script 通信 | popup 与页面通信 |
| `storage` | 保存用户设置 | 本地存储，不上传 |
| `<all_urls>` (host) | Content Script 匹配所有页面 | 框选 OCR 需要在所有页面生效 |

### 不上传任何数据

- **截图权限仅用于用户主动框选当前可见页面区域并进行本地 OCR 识别**
- OCR 识别完全在浏览器本地完成
- 插件不会上传图片、截图或网页内容到任何服务器

---

## 许可证

MIT License

---

**CopyLens** — 所见即所得，框选哪里就识别哪里 🔍
