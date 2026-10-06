// localStorage JSON 读取统一收口：损坏的 JSON 若不摘除 key，每次启动都会在原处
// 复现 SyntaxError，且发生在 store/模块初始化期（bootstrap 的 catch 覆盖不到），
// 应用将永久白屏。解析失败时移除该 key 并返回回退值，让下次启动自愈。
export function readLocalStorageJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] localStorage['${key}'] JSON 解析失败，已重置:`, err);
    localStorage.removeItem(key);
    return fallback;
  }
}
