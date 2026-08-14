/**
 * CopyLens - 浏览器 API 封装层
 *
 * 将 chrome.* API 封装到此文件，方便以后适配 Firefox (browser.*)
 * 或其他 Chromium 系浏览器的 API 差异。
 *
 * 关键：模块初始化时不抛出异常。即使 chrome.runtime 不可用，
 * 也只记录错误并返回一个安全的存根对象，避免页面崩溃。
 */

function getBrowserAPI(): typeof chrome {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return chrome;
  }

  if (typeof chrome !== 'undefined') {
    return chrome;
  }

  // 完全不可用（非浏览器扩展环境），返回代理对象
  return new Proxy({} as typeof chrome, {
    get(_target, prop: string) {
      console.error(`CopyLens: 尝试访问 chrome.${prop} 但 chrome 不可用`);
      return undefined;
    },
  });
}

const browser = getBrowserAPI();

export default browser;

// --- 常用 API 快捷封装 ---

/**
 * 获取当前活动标签页
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = browser.tabs;
  if (!tabs) {
    throw new Error('CopyLens: chrome.tabs API 不可用');
  }
  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error('无法获取当前标签页');
  }
  return tab;
}

/**
 * 截取当前标签页可见区域
 *
 * 需要 activeTab 权限（用户点击扩展图标后授予）。
 */
export function captureVisibleTab(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message || '截图失败');
        err.name = 'CaptureVisibleTabError';
        reject(err);
        return;
      }
      if (!dataUrl) {
        reject(new Error('截图结果为空，请重试'));
        return;
      }
      resolve(dataUrl);
    });
  });
}

/**
 * 从 storage.local 读取数据
 */
export async function getStorage<T = Record<string, unknown>>(
  keys: string | string[] | null
): Promise<T> {
  return new Promise((resolve, reject) => {
    browser.storage.local.get(keys, (result) => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
        return;
      }
      resolve(result as T);
    });
  });
}

/**
 * 向 storage.local 写入数据
 */
export async function setStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.storage.local.set(items, () => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

/**
 * 监听 storage 变化
 */
export function onStorageChanged(
  callback: (changes: Record<string, chrome.storage.StorageChange>) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName === 'local') {
      callback(changes);
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/**
 * 获取扩展资源 URL
 */
export function getExtensionUrl(path: string): string {
  return browser.runtime.getURL(path);
}
