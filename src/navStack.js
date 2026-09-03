// ブラウザ（特にスマートフォン）の「戻る」操作で、開いているモーダルやモバイルの「結果」ビューを
// 閉じられるようにするための履歴スタック。history.pushState で1件ずつ状態を積み、popstate で巻き戻す。
// UI 側で閉じたときは history.back() で自分の状態を取り除くが、その popstate が届くまでの間に
// 新しい項目が開かれることがある（例: 一覧パネルを閉じて結果ビューへ移る）ため、その間の push は保留して
// popstate 処理後に積む。
const stack = []; // { id, onBack, pushed, released }
const queued = [];
let installed = false;
let pendingBack = 0;

function doPush(entry) {
  try { history.pushState({ dpcNav: entry.id }, ""); } catch { return; }
  entry.pushed = true;
  stack.push(entry);
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", (e) => {
    const cur = e.state && e.state.dpcNav;
    if (pendingBack > 0) pendingBack--;
    // 現在の履歴状態より上に積まれている項目を、上から順に閉じる
    while (stack.length && stack[stack.length - 1].id !== cur) {
      const top = stack.pop();
      if (!top.released) { try { top.onBack(); } catch { /* ignore */ } }
    }
    if (pendingBack === 0 && queued.length) {
      for (const en of queued.splice(0)) if (!en.released) doPush(en);
    }
  });
}

/**
 * 「戻る」で閉じたい UI が開いたときに呼ぶ。戻り値は UI 側で閉じたときに呼ぶ解放関数
 * （履歴に残った自分の状態を history.back() で取り除く）。
 */
export function pushNav(onBack) {
  install();
  if (typeof history === "undefined" || typeof history.pushState !== "function") return () => {};
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), onBack, pushed: false, released: false };
  if (pendingBack > 0) queued.push(entry); else doPush(entry);
  return () => {
    if (entry.released) return;
    entry.released = true;
    if (!entry.pushed) { const q = queued.indexOf(entry); if (q >= 0) queued.splice(q, 1); return; }
    const i = stack.indexOf(entry);
    if (i < 0) return; // 既に「戻る」で処理済み
    stack.splice(i, 1);
    if (history.state && history.state.dpcNav === entry.id) { pendingBack++; history.back(); }
  };
}

export function navDepth() { return stack.length; }
