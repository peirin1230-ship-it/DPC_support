import { Component } from "react";
import { createRoot } from "react-dom/client";
import DPCTool from "./components/DPCTool";
import { D } from "./data.js";
import { F } from "./styles";

// 描画中の未捕捉例外で画面が白紙になるのを防ぐ（React 18 はエラー時にルートをアンマウントする）
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("DPC検索ツール: 描画エラー", error, info?.componentStack); }
  clearStorageAndReload() {
    try { ["dpc_search_history", "dpc_favorites", "dpc_feedback"].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    location.reload();
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" style={{ fontFamily: F, maxWidth: 640, margin: "48px auto", padding: "24px 28px", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 12, color: "#404040" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#262626", marginBottom: 8 }}>表示中にエラーが発生しました</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          ページを再読み込みしてください。繰り返し発生する場合は、このブラウザに保存された履歴・お気に入りを消去して再読み込みすると復旧することがあります。
        </div>
        <pre style={{ fontSize: 11, background: "#F5F5F5", padding: 10, borderRadius: 6, overflowX: "auto", whiteSpace: "pre-wrap", color: "#737373" }}>
          {String(error?.message || error)}{"\n"}データ: {D.meta?.label || ""} / {D.meta?.sourceFile || ""} (as-of {D.meta?.asOf || "-"})
        </pre>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => location.reload()} style={{ padding: "8px 18px", background: "#262626", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>再読み込み</button>
          <button onClick={() => this.clearStorageAndReload()} style={{ padding: "8px 18px", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 6, color: "#B91C1C", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>履歴・お気に入りを消去して再読み込み</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <DPCTool />
  </ErrorBoundary>
);
