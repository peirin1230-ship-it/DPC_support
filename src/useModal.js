import { useEffect, useRef } from "react";

// モーダルのアクセシビリティ: フォーカストラップ + Escキー閉じ + 開閉時フォーカス管理
export default function useModal(onClose) {
  const ref = useRef(null);
  const prevFocus = useRef(null);

  useEffect(() => {
    // モーダルが開いたら前のフォーカスを保存し、モーダル内にフォーカスを移す
    prevFocus.current = document.activeElement;
    const el = ref.current;
    if (!el) return;

    // モーダル内の最初のフォーカス可能な要素にフォーカス
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;

      const nodes = el.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // モーダルが閉じたら前のフォーカスを復帰
      if (prevFocus.current && typeof prevFocus.current.focus === "function") {
        prevFocus.current.focus();
      }
    };
  }, [onClose]);

  return ref;
}
