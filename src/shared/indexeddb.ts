/**
 * CopyLens - IndexedDB 截图暂存（Blob / ArrayBuffer 双格式）
 *
 * 用于在 popup 与 selector 页面之间传递截图。
 * 整屏截图可能很大，因此：
 * - 优先存 Blob（IndexedDB 可高效存储二进制）
 * - Blob 保存失败时（部分浏览器报 UnknownError: Internal error），
 *   回退为 ArrayBuffer + mimeType
 *
 * 同一扩展内所有页面（popup / selector）共享同一个 IndexedDB。
 */

const DB_NAME = 'copylens';
const STORE_NAME = 'screenshots';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开 IndexedDB'));
  });
}

/**
 * 保存截图 Blob 到 IndexedDB（id 为主键）
 */
export async function saveScreenshotBlob(data: {
  id: string;
  blob: Blob;
  language: string;
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(
      { id: data.id, kind: 'blob', blob: data.blob, language: data.language, timestamp: Date.now() },
      data.id
    );
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('写入 IndexedDB 失败')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('写入 IndexedDB 被中止')); };
  });
}

/**
 * 保存截图 ArrayBuffer 到 IndexedDB（Blob 保存失败时的回退方案）
 */
export async function saveScreenshotArrayBuffer(data: {
  id: string;
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  language: string;
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(
      {
        id: data.id,
        kind: 'arraybuffer',
        arrayBuffer: data.arrayBuffer,
        mimeType: data.mimeType,
        language: data.language,
        timestamp: Date.now(),
      },
      data.id
    );
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('写入 IndexedDB 失败')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('写入 IndexedDB 被中止')); };
  });
}

/**
 * 按 id 从 IndexedDB 读取截图（自动处理 Blob / ArrayBuffer 两种格式）
 */
export async function loadScreenshotFromIdb(
  id: string
): Promise<{ blob: Blob; language: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const record = req.result as
        | { kind: 'blob'; blob: Blob; language: string }
        | { kind: 'arraybuffer'; arrayBuffer: ArrayBuffer; mimeType: string; language: string }
        | undefined;
      db.close();

      if (!record) {
        resolve(null);
      } else if (record.kind === 'blob' && record.blob) {
        resolve({ blob: record.blob, language: record.language });
      } else if (record.kind === 'arraybuffer' && record.arrayBuffer) {
        resolve({
          blob: new Blob([record.arrayBuffer], { type: record.mimeType || 'image/jpeg' }),
          language: record.language,
        });
      } else {
        resolve(null);
      }
    };
    req.onerror = () => { db.close(); reject(req.error ?? new Error('读取 IndexedDB 失败')); };
  });
}

/**
 * 按 id 删除截图（OCR 完成后释放空间）
 */
export async function deleteScreenshotFromIdb(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('删除 IndexedDB 失败')); };
  });
}
