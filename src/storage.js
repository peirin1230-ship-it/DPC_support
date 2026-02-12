const HIST_KEY = "dpc_search_history";
const FAV_KEY  = "dpc_favorites";
const MAX_HIST = 20;

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    // データが配列でなければ壊れているとみなす
    if (!Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    // JSONパースエラーやlocalStorage無効の場合は安全に初期値を返す
    return fallback;
  }
}

function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // 容量超過やプライベートブラウジング時などでは保存失敗するが無視して続行
  }
}

// --- 検索履歴 ---
// 最大20件まで自動保存。同じ検索条件は重複を除いて先頭に移動する
export function getHistory()        { return load(HIST_KEY, []); }
export function addHistory(entry)   {
  const h = load(HIST_KEY, []);
  // 同一条件の重複を除去（検索条件の文字列で判定）
  const dup = h.findIndex(x => x.key === entry.key);
  if (dup !== -1) h.splice(dup, 1);
  h.unshift(entry);
  if (h.length > MAX_HIST) h.length = MAX_HIST;
  save(HIST_KEY, h);
}
export function clearHistory()      { save(HIST_KEY, []); }

// --- お気に入り ---
// ブラウザのlocalStorageに保存されるため、同じブラウザ+同じURLでアクセスすれば維持される
// キャッシュクリアやシークレットモードでは保持されない点に注意
export function getFavorites()                      { return load(FAV_KEY, []); }
export function addFavorite(code, clsName, surgeryName) {
  const f = load(FAV_KEY, []);
  if (f.some(x => x.code === code)) return;
  f.unshift({ code, clsName, surgeryName, ts: Date.now() });
  save(FAV_KEY, f);
}
export function removeFavorite(code) {
  save(FAV_KEY, load(FAV_KEY, []).filter(x => x.code !== code));
}
export function isFavorite(code) {
  return load(FAV_KEY, []).some(x => x.code === code);
}
