/**
 * CopyLens - OCR 识别结果浮动面板
 *
 * 在网页右侧/右下角显示 OCR 识别结果的浮动面板。
 * 包含：识别文字、复制按钮、重新识别按钮、关闭按钮。
 */

export interface FloatingPanelCallbacks {
  onCopy: (text: string) => void;
  onRetry: () => void;
  onClose: () => void;
}

/** 浮动面板单例 */
let currentPanel: HTMLDivElement | null = null;
let currentCallbacks: FloatingPanelCallbacks | null = null;

/**
 * 创建浮动面板 DOM 结构
 */
function createPanelElement(): HTMLDivElement {
  // 移除已有面板
  if (currentPanel) {
    currentPanel.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'copylens-floating-panel';
  panel.innerHTML = `
    <div class="copylens-panel-header">
      <span class="copylens-panel-title">CopyLens OCR</span>
      <button class="copylens-panel-close" title="关闭">✕</button>
    </div>
    <div class="copylens-panel-body">
      <div class="copylens-panel-status">
        <span class="copylens-spinner"></span>
        <span>正在识别框选区域文字...</span>
      </div>
      <div class="copylens-panel-result" style="display:none;">
        <textarea class="copylens-panel-text" readonly placeholder="识别结果将显示在这里..."></textarea>
        <div class="copylens-panel-error" style="display:none;"></div>
      </div>
    </div>
    <div class="copylens-panel-footer" style="display:none;">
      <button class="copylens-btn copylens-btn-copy">📋 复制到剪贴板</button>
      <button class="copylens-btn copylens-btn-retry">🔄 重新识别</button>
    </div>
  `;

  // 绑定事件
  const closeBtn = panel.querySelector('.copylens-panel-close') as HTMLButtonElement;
  closeBtn.addEventListener('click', () => {
    currentCallbacks?.onClose();
  });

  const copyBtn = panel.querySelector('.copylens-btn-copy') as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const textarea = panel.querySelector('.copylens-panel-text') as HTMLTextAreaElement;
    currentCallbacks?.onCopy(textarea.value);
  });

  const retryBtn = panel.querySelector('.copylens-btn-retry') as HTMLButtonElement;
  retryBtn.addEventListener('click', () => {
    currentCallbacks?.onRetry();
  });

  document.body.appendChild(panel);
  currentPanel = panel;
  return panel;
}

/**
 * 注入面板样式到页面
 */
function injectPanelStyles(): void {
  if (document.getElementById('copylens-panel-styles')) return;

  const style = document.createElement('style');
  style.id = 'copylens-panel-styles';
  style.textContent = `
    #copylens-floating-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 380px;
      max-height: 500px;
      background: #ffffff;
      border: 1px solid #d0d5dd;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      color: #1d2939;
      animation: copylens-slide-up 0.25s ease-out;
      resize: both;
      overflow: hidden;
      min-width: 280px;
      min-height: 200px;
    }

    @keyframes copylens-slide-up {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .copylens-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #eaecf0;
      background: #f9fafb;
      border-radius: 12px 12px 0 0;
      cursor: move;
      user-select: none;
    }

    .copylens-panel-title {
      font-weight: 600;
      font-size: 14px;
      color: #101828;
    }

    .copylens-panel-close {
      background: none;
      border: none;
      font-size: 18px;
      color: #667085;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      line-height: 1;
      transition: all 0.15s;
    }

    .copylens-panel-close:hover {
      background: #eaecf0;
      color: #101828;
    }

    .copylens-panel-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      min-height: 100px;
    }

    .copylens-panel-status {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #667085;
      font-size: 13px;
    }

    .copylens-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #eaecf0;
      border-top-color: #0066ff;
      border-radius: 50%;
      animation: copylens-spin 0.7s linear infinite;
      flex-shrink: 0;
    }

    @keyframes copylens-spin {
      to { transform: rotate(360deg); }
    }

    .copylens-panel-text {
      width: 100%;
      min-height: 120px;
      max-height: 300px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.6;
      color: #1d2939;
      background: #fcfcfd;
      resize: vertical;
      box-sizing: border-box;
      font-family: inherit;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .copylens-panel-text:focus {
      outline: none;
      border-color: #0066ff;
      box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.1);
    }

    .copylens-panel-error {
      padding: 10px 12px;
      background: #fef3f2;
      border: 1px solid #fecdca;
      border-radius: 8px;
      color: #b42318;
      font-size: 13px;
    }

    .copylens-panel-footer {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #eaecf0;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .copylens-btn {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      background: #ffffff;
      color: #344054;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-family: inherit;
    }

    .copylens-btn:hover {
      background: #f2f4f7;
      border-color: #98a2b3;
    }

    .copylens-btn:active {
      background: #eaecf0;
    }

    .copylens-btn-copy {
      background: #0066ff;
      color: #ffffff;
      border-color: #0066ff;
    }

    .copylens-btn-copy:hover {
      background: #0052cc;
      border-color: #0052cc;
    }

    /* 拖拽相关 */
    #copylens-floating-panel.dragging {
      transition: none !important;
      opacity: 0.9;
    }
  `;

  document.head.appendChild(style);
}

/**
 * 显示浮动面板（加载状态）
 */
export function showPanel(callbacks: FloatingPanelCallbacks): void {
  injectPanelStyles();

  currentCallbacks = callbacks;
  const panel = createPanelElement();

  // 显示加载状态
  showLoading();

  // 添加拖拽支持
  enableDrag(panel);
}

/**
 * 显示加载状态（也可被 areaSelection 模块调用）
 */
export function showLoading(): void {
  if (!currentPanel) return;
  const status = currentPanel.querySelector('.copylens-panel-status') as HTMLElement;
  const result = currentPanel.querySelector('.copylens-panel-result') as HTMLElement;
  const footer = currentPanel.querySelector('.copylens-panel-footer') as HTMLElement;
  const errorEl = currentPanel.querySelector('.copylens-panel-error') as HTMLElement;
  const textarea = currentPanel.querySelector('.copylens-panel-text') as HTMLTextAreaElement;

  if (status) status.style.display = 'flex';
  if (result) result.style.display = 'none';
  if (footer) footer.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  if (textarea) textarea.style.display = 'none';

  // 恢复复制按钮（如果之前被错误状态隐藏）
  const copyBtn = currentPanel.querySelector('.copylens-btn-copy') as HTMLElement;
  if (copyBtn) copyBtn.style.display = '';
}

/**
 * 显示 OCR 识别结果
 */
export function showResult(text: string): void {
  console.log('CopyLens Panel: showResult 调用, 文本长度 →', text.length);
  if (!currentPanel) {
    console.error('CopyLens Panel: showResult 失败 — currentPanel 为 null');
    return;
  }

  const status = currentPanel.querySelector('.copylens-panel-status') as HTMLElement;
  const result = currentPanel.querySelector('.copylens-panel-result') as HTMLElement;
  const textarea = currentPanel.querySelector('.copylens-panel-text') as HTMLTextAreaElement;
  const error = currentPanel.querySelector('.copylens-panel-error') as HTMLElement;
  const footer = currentPanel.querySelector('.copylens-panel-footer') as HTMLElement;

  console.log('CopyLens Panel: DOM 元素状态 →', {
    status: !!status, result: !!result, textarea: !!textarea,
    error: !!error, footer: !!footer,
  });

  if (status) status.style.display = 'none';
  if (result) result.style.display = 'block';
  if (textarea) {
    textarea.style.display = 'block';
    textarea.value = text;
  }
  if (error) error.style.display = 'none';
  if (footer) footer.style.display = 'flex';

  // 恢复复制按钮（如果之前被错误状态隐藏）
  const copyBtn = currentPanel.querySelector('.copylens-btn-copy') as HTMLElement;
  if (copyBtn) copyBtn.style.display = '';

  console.log('CopyLens Panel: 渲染完成, 文本长度 →', text.length);

  // 如果没有识别到文字
  if (!text.trim()) {
    if (textarea) textarea.value = '（未识别到文字，请重新框选更清晰的区域。）';
  }
}

/**
 * 显示错误信息
 */
export function showError(message: string): void {
  if (!currentPanel) return;

  const status = currentPanel.querySelector('.copylens-panel-status') as HTMLElement;
  const textarea = currentPanel.querySelector('.copylens-panel-text') as HTMLTextAreaElement;
  const error = currentPanel.querySelector('.copylens-panel-error') as HTMLElement;
  const footer = currentPanel.querySelector('.copylens-panel-footer') as HTMLElement;
  const result = currentPanel.querySelector('.copylens-panel-result') as HTMLElement;

  if (status) status.style.display = 'none';
  if (result) result.style.display = 'block';
  if (textarea) textarea.style.display = 'none';
  if (error) {
    error.style.display = 'block';
    error.textContent = `❌ ${message}`;
  }
  if (footer) footer.style.display = 'flex';
  // 错误时隐藏复制按钮（因为没有内容可复制），但保留重试按钮
  const copyBtn = currentPanel.querySelector('.copylens-btn-copy') as HTMLElement;
  if (copyBtn) copyBtn.style.display = 'none';
  const retryBtn = currentPanel.querySelector('.copylens-btn-retry') as HTMLElement;
  if (retryBtn) retryBtn.style.display = '';
}

/**
 * 隐藏并销毁浮动面板
 */
export function hidePanel(): void {
  if (currentPanel) {
    currentPanel.remove();
    currentPanel = null;
  }
  currentCallbacks = null;
}

/**
 * 检查面板是否正在显示
 */
export function isPanelVisible(): boolean {
  return currentPanel !== null;
}

/**
 * 启用面板拖拽功能
 */
function enableDrag(panel: HTMLDivElement): void {
  const header = panel.querySelector('.copylens-panel-header') as HTMLElement;
  if (!header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let panelLeft = 0;
  let panelTop = 0;

  // 面板使用 fixed 定位，默认在右下角
  // 拖拽时切换到 left/top 模式
  function setFixedPosition(left: number, top: number): void {
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  header.addEventListener('mousedown', (e: MouseEvent) => {
    // 忽略按钮点击
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;

    isDragging = true;
    panel.classList.add('dragging');

    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    panelLeft = rect.left;
    panelTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    setFixedPosition(panelLeft + deltaX, panelTop + deltaY);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      panel.classList.remove('dragging');
    }
  });
}
