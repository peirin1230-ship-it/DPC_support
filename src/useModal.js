import { useEffect, useRef } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
// 開いているモーダルのスタック。Escキーは最前面のモーダルだけが処理する
const stack = [];

// モーダルのアクセシビリティ: フォーカストラップ + Escキー閉じ + 開閉時フォーカス管理
// onClose は ref 経由で参照するため、親の再レンダーで関数が変わってもフォーカスは移動しない
export default function useModal(onClose) {
  const ref = useRef(null);
  const prevFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = {};
    stack.push(token);
    // モーダルが開いたら前のフォーカスを保存し、モーダル内にフォーカスを移す
    prevFocus.current = document.activeElement;
    const el = ref.current;
    if (el) {
      const focusable = el.querySelectorAll(FOCUSABLE);
      if (focusable.length > 0) focusable[0].focus();
    }

    const handleKeyDown = (e) => {
      if (stack[stack.length - 1] !== token) return; // 背面のモーダルは無視
      if (e.key === "Escape") { onCloseRef.current?.(); return; }
      if (e.key !== "Tab" || !el) return;

      const nodes = el.querySelectorAll(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      // モーダルが閉じたら前のフォーカスを復帰
      const prev = prevFocus.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, []);

  return ref;
}
