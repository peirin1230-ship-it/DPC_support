import AC from "./AC";
import { M } from "../styles";

// オートコンプリートで選んだコードをチップとして複数保持する入力欄（複数の手術・処置等・薬剤・病名候補の一括入力）
export default function ChipInput({ label, text, setText, items, setItems, searchFn, nameOf, placeholder, showTag, isMobile, chipColor }) {
  const add = (code) => { if (!code) return; if (!items.includes(code)) setItems([...items, code]); setText(""); };
  const remove = (code) => setItems(items.filter((c) => c !== code));
  return (
    <div>
      <AC label={label} value={text} onChange={setText} onSelect={(r) => add(r.code)} searchFn={searchFn} placeholder={placeholder} showTag={showTag} isMobile={isMobile} />
      {items.length > 0 && (
        <div role="list" aria-label={`${label}の選択済み`} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
          {items.map((c) => (
            <span key={c} role="listitem" style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", background: "#F5F5F5", border: "1px solid #E0E0E0", borderRadius: 999, padding: "2px 4px 2px 8px", fontSize: 11, color: "#404040" }}>
              <span style={{ fontFamily: M, color: chipColor || "#3B82F6", fontWeight: 600, whiteSpace: "nowrap" }}>{c}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 150 : 210 }}>{nameOf(c)}</span>
              <button type="button" onClick={() => remove(c)} aria-label={`${c} を外す`}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#737373", padding: "0 4px", fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
