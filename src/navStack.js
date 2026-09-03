// ブラウザ（特にスマートフォン）の「戻る」操作で、開いているモーダルやモバイルの「結果」ビューを
// 閉じられるようにするための履歴スタック。history.pushState で1件ずつ状態を積み、popstate で巻き戻す。
const stack = []; // { id, onBack }
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", (e) => {
    const cur = e.state && e.state.dpcNav;
    // 現在の履歴状態より上に積まれている項目を、上から順に閉じる
    while (stack.length && stack[stack.length - 1].id !== cur) {
      const top = stack.pop();
      try { top.onBack(); } catch { /* ignore */ }
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
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try { history.pushState({ dpcNav: id }, ""); } catch { return () => {}; }
  const entry = { id, onBack };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i < 0) return; // 既に「戻る」で処理済み
    stack.splice(i, 1);
    if (history.state && history.state.dpcNav === id) history.back();
  };
}

export function navDepth() { return stack.length; }
