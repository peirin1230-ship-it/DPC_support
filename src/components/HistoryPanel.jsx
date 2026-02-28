import { useState } from "react";
import { M } from "../styles";
import { getHistory, clearHistory, getFavorites, removeFavorite } from "../storage";

export default function HistoryPanel({ onClose, onRestoreSearch, onJumpToCode, onAddToCompare, cmpSet }) {
  const [tab, setTab] = useState("history");
  const history = getHistory();
  const favorites = getFavorites();

  const tabStyle = (active) => ({
    flex: 1, padding: "7px 0", background: active ? "#FAFAFA" : "transparent",
    border: "none", borderBottom: active ? "2px solid #404040" : "2px solid transparent",
    color: active ? "#262626" : "#737373", fontSize: 13, fontWeight: 600, cursor: "pointer"
  });

  return (
    <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, width: 420, maxHeight: 440,
      background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,.08)",
      display: "flex", flexDirection: "column", marginTop: 4 }}>

      {/* タブヘッダー */}
      <div role="tablist" style={{ display: "flex", borderBottom: "1px solid #E0E0E0", flexShrink: 0 }}>
        <button role="tab" id="hp-tab-history" aria-selected={tab === "history"} aria-controls="hp-panel-history" style={tabStyle(tab === "history")} onClick={() => setTab("history")}>
          履歴（{history.length}）
        </button>
        <button role="tab" id="hp-tab-favorites" aria-selected={tab === "favorites"} aria-controls="hp-panel-favorites" style={tabStyle(tab === "favorites")} onClick={() => setTab("favorites")}>
          お気に入り（{favorites.length}）
        </button>
        <button onClick={onClose} aria-label="閉じる" style={{ background: "none", border: "none", color: "#737373",
          cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
      </div>

      {/* コンテンツ */}
      <div role="tabpanel" id={tab === "history" ? "hp-panel-history" : "hp-panel-favorites"} aria-labelledby={tab === "history" ? "hp-tab-history" : "hp-tab-favorites"} style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {tab === "history" ? (
          history.length === 0 ? (
            <div style={{ color: "#737373", fontSize: 13, textAlign: "center", padding: 20 }}>検索履歴はありません</div>
          ) : (
            <>
              {history.map((h, i) => (
                <button key={i} onClick={() => { onRestoreSearch(h); onClose(); }}
                  style={{ padding: "6px 8px", borderRadius: 4, cursor: "pointer", marginBottom: 2,
                    fontSize: 12, color: "#404040", border: "1px solid transparent", transition: "background .15s, border-color .15s", width: "100%", textAlign: "left", background: "transparent", display: "block" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F5F5F5"; e.currentTarget.style.borderColor = "#E0E0E0"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {h.icd && <span style={{ color: "#3B82F6", fontSize: 11 }}>{h.icd}</span>}
                    {h.surg && <span style={{ color: "#10B981", fontSize: 11 }}>{h.surg}</span>}
                    {h.proc && <span style={{ color: "#8B5CF6", fontSize: 11 }}>{h.proc}</span>}
                    {h.drug && <span style={{ color: "#EA580C", fontSize: 11 }}>{h.drug}</span>}
                  </div>
                  <div style={{ color: "#737373", fontSize: 10, marginTop: 2 }}>{h.count}件 ─ {h.label}</div>
                </button>
              ))}
              <button onClick={() => { if(window.confirm("検索履歴をすべて削除しますか？")){clearHistory(); onClose();} }}
                style={{ width: "100%", marginTop: 4, padding: "6px 0", background: "none",
                  border: "1px solid #E0E0E0", borderRadius: 4, color: "#737373", cursor: "pointer", fontSize: 11, transition: "background .15s" }}>
                履歴をクリア
              </button>
            </>
          )
        ) : (
          favorites.length === 0 ? (
            <div style={{ color: "#737373", fontSize: 13, textAlign: "center", padding: 20 }}>お気に入りはありません</div>
          ) : (
            favorites.map((f, i) => {
              const inCmp = cmpSet && cmpSet.has(f.code);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                  borderRadius: 4, marginBottom: 2, border: "1px solid transparent", transition: "background .15s, border-color .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F5F5F5"; e.currentTarget.style.borderColor = "#E0E0E0"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                  <button style={{ flex: 1, cursor: "pointer", minWidth: 0, background: "none", border: "none", textAlign: "left", padding: 0 }}
                    onClick={() => { onJumpToCode(f.code); onClose(); }}>
                    <span style={{ color: "#3B82F6", fontFamily: M, fontSize: 13, fontWeight: 600 }}>{f.code}</span>
                    <span style={{ color: "#737373", fontSize: 12, marginLeft: 6 }}>{f.clsName}</span>
                    {f.surgeryName && f.surgeryName !== "なし" && (
                      <span style={{ color: "#737373", fontSize: 11, marginLeft: 4 }}>{f.surgeryName}</span>
                    )}
                  </button>
                  {/* 比較リストに追加ボタン */}
                  <button
                    onClick={e => { e.stopPropagation(); onAddToCompare && onAddToCompare(f.code); }}
                    title={inCmp ? "比較リストに追加済み" : "比較リストに追加"}
                    style={{ background: inCmp ? "rgba(245,158,11,.1)" : "#F2F2F2", border: inCmp ? "1px solid #F59E0B" : "1px solid #E0E0E0",
                      borderRadius: 4, color: inCmp ? "#F59E0B" : "#737373", cursor: "pointer",
                      padding: "2px 6px", fontSize: 11, flexShrink: 0, fontWeight: 600 }}>
                    {inCmp ? "比較中" : "+比較"}
                  </button>
                  <button onClick={() => { removeFavorite(f.code); onClose(); }} aria-label="お気に入りから削除"
                    style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer",
                      padding: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg></button>
                </div>
              );
            })
          )
        )}
      </div>

      {/* localStorage保存に関する注記 */}
      <div style={{ borderTop: "1px solid #E0E0E0", padding: "6px 12px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: "#737373", lineHeight: 1.4 }}>
          履歴・お気に入りはこのブラウザに保存されます。キャッシュクリアやシークレットモードでは保持されません。
        </div>
      </div>
    </div>
  );
}
