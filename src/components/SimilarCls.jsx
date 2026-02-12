import { useState, useMemo } from "react";
import { M } from "../styles";
import { getSimilarClassifications } from "../utils";

export default function SimilarCls({ cls, onSearch }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => getSimilarClassifications(cls), [cls]);
  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▸</span>
        同一MDC内の類似分類（{items.length}件）
      </button>
      {open && (
        <div style={{ marginTop: 6, background: "#0a0f1a", borderRadius: 6, padding: 8, maxHeight: 240, overflow: "auto" }}>
          {items.map((it, i) => (
            <div key={i}
              onClick={() => onSearch && onSearch(it.cls)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4,
                cursor: onSearch ? "pointer" : "default", marginBottom: 2, border: "1px solid transparent" }}
              onMouseEnter={e => { if (onSearch) { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.borderColor = "#334155"; } }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
              <span style={{ color: "#38bdf8", fontFamily: M, fontSize: 12, fontWeight: 600, flexShrink: 0, minWidth: 50 }}>{it.cls}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#cbd5e1", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#64748b", marginTop: 1 }}>
                  <span>DPC {it.dpcCount}件</span>
                  <span>手術 {it.surgCount}区分</span>
                  <span>期間I {it.minP1 === it.maxP1 ? `${it.minP1.toLocaleString()}点` : `${it.minP1.toLocaleString()}〜${it.maxP1.toLocaleString()}点`}</span>
                  <span>最大{it.maxD3}日</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
