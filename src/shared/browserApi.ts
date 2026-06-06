/**
 * CopyLens - 浏览器 API 封装层
 *
 * 将 chrome.* API 封装到此文件，方便以后适配 Firefox (browser.*)
 * 或其他 Chromium 系浏览器的 API 差异。
 *
 * 当前第一版统一使用 chrome.* API。
 * 如需适配 Firefox，只需在此文件中将 chrome.* 替换为 browser.* 即可。
 */

/**
 * 获取当前浏览器环境是否支持 chrome API
 */
function getBrowserAPI(): typeof chrome {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    return chrome;
  }
  // 以后适配 Firefox 时:
  // if (typeof browser !== 'undefined') { return browser; }
  throw new Error('CopyLens: 当前环境不支持浏览器扩展 API');
}

const browser = getBrowserAPI();

export default browser;

// --- 常用 API 快捷封装 ---

/**
 * 获取当前活动标签页
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error('无法获取当前标签页');
  }
  return tab;
}

/**
 * 向当前活动标签页发送消息
 *
 * @throws 如果标签页不可用、content script 未注入、或消息发送失败
 */
export async function sendMessageToActiveTab<T = unknown>(
  message: unknown
): Promise<T> {
  const tab = await getActiveTab();
  if (!tab.id) {
    throw new Error('无法获取当前标签页。请刷新页面后重试。');
  }

  return new Promise<T>((resolve, reject) => {
    browser.tabs.sendMessage(tab.id!, message, (response) => {
      if (browser.runtime.lastError) {
        const errMsg = browser.runtime.lastError.message || '未知错误';
        console.debug('CopyLens: 发送消息到标签页失败:', errMsg);
        reject(new Error(`无法连接到当前页面 (${errMsg})。\n\n请刷新页面后重试。`));
        return;
      }
      resolve(response as T);
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
  // 返回取消监听的函数
  return () => browser.storage.onChanged.removeListener(listener);
}

/**
 * 获取扩展资源 URL
 */
export function getExtensionUrl(path: string): string {
  return browser.runtime.getURL(path);
}
