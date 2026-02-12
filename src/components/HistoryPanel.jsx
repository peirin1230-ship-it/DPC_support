import { useState } from "react";
import { M } from "../styles";
import { getHistory, clearHistory, getFavorites, removeFavorite } from "../storage";

export default function HistoryPanel({ onClose, onRestoreSearch, onJumpToCode, onAddToCompare, cmpSet }) {
  const [tab, setTab] = useState("history");
  const history = getHistory();
  const favorites = getFavorites();

  const tabStyle = (active) => ({
    flex: 1, padding: "7px 0", background: active ? "#1e293b" : "transparent",
    border: "none", borderBottom: active ? "2px solid #38bdf8" : "2px solid transparent",
    color: active ? "#e2e8f0" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer"
  });

  return (
    <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, width: 420, maxHeight: 440,
      background: "#111827", border: "1px solid #1e293b", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,.5)",
      display: "flex", flexDirection: "column", marginTop: 4 }}>

      {/* タブヘッダー */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
        <button style={tabStyle(tab === "history")} onClick={() => setTab("history")}>
          履歴（{history.length}）
        </button>
        <button style={tabStyle(tab === "favorites")} onClick={() => setTab("favorites")}>
          お気に入り（{favorites.length}）
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b",
          cursor: "pointer", padding: "0 10px", fontSize: 14 }}>✕</button>
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {tab === "history" ? (
          history.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 20 }}>検索履歴はありません</div>
          ) : (
            <>
              {history.map((h, i) => (
                <div key={i} onClick={() => { onRestoreSearch(h); onClose(); }}
                  style={{ padding: "6px 8px", borderRadius: 4, cursor: "pointer", marginBottom: 2,
                    fontSize: 12, color: "#cbd5e1", border: "1px solid transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = "#334155"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {h.icd && <span style={{ color: "#38bdf8", fontSize: 11 }}>{h.icd}</span>}
                    {h.surg && <span style={{ color: "#34d399", fontSize: 11 }}>{h.surg}</span>}
                    {h.proc && <span style={{ color: "#a78bfa", fontSize: 11 }}>{h.proc}</span>}
                    {h.drug && <span style={{ color: "#f97316", fontSize: 11 }}>{h.drug}</span>}
                  </div>
                  <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>{h.count}件 ─ {h.label}</div>
                </div>
              ))}
              <button onClick={() => { clearHistory(); onClose(); }}
                style={{ width: "100%", marginTop: 4, padding: "6px 0", background: "none",
                  border: "1px solid #1e293b", borderRadius: 4, color: "#64748b", cursor: "pointer", fontSize: 11 }}>
                履歴をクリア
              </button>
            </>
          )
        ) : (
          favorites.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 20 }}>お気に入りはありません</div>
          ) : (
            favorites.map((f, i) => {
              const inCmp = cmpSet && cmpSet.has(f.code);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                  borderRadius: 4, marginBottom: 2, border: "1px solid transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = "#334155"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                  <div style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                    onClick={() => { onJumpToCode(f.code); onClose(); }}>
                    <span style={{ color: "#38bdf8", fontFamily: M, fontSize: 13, fontWeight: 600 }}>{f.code}</span>
                    <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 6 }}>{f.clsName}</span>
                    {f.surgeryName && f.surgeryName !== "なし" && (
                      <span style={{ color: "#64748b", fontSize: 11, marginLeft: 4 }}>{f.surgeryName}</span>
                    )}
                  </div>
                  {/* 比較リストに追加ボタン */}
                  <button
                    onClick={e => { e.stopPropagation(); onAddToCompare && onAddToCompare(f.code); }}
                    title={inCmp ? "比較リストに追加済み" : "比較リストに追加"}
                    style={{ background: inCmp ? "rgba(245,158,11,.15)" : "#0f172a", border: inCmp ? "1px solid #f59e0b" : "1px solid #334155",
                      borderRadius: 4, color: inCmp ? "#f59e0b" : "#94a3b8", cursor: "pointer",
                      padding: "2px 6px", fontSize: 11, flexShrink: 0, fontWeight: 600 }}>
                    {inCmp ? "比較中" : "+比較"}
                  </button>
                  <button onClick={() => { removeFavorite(f.code); onClose(); }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer",
                      padding: "2px 4px", fontSize: 13, flexShrink: 0 }}>✕</button>
                </div>
              );
            })
          )
        )}
      </div>

      {/* localStorage保存に関する注記 */}
      <div style={{ borderTop: "1px solid #1e293b", padding: "6px 12px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.4 }}>
          履歴・お気に入りはこのブラウザに保存されます。キャッシュクリアやシークレットモードでは保持されません。
        </div>
      </div>
    </div>
  );
}
