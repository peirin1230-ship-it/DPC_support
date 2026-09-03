import { useState, useMemo } from "react";
import { D } from "../data";
import { M } from "../styles";
import { normalize, getDekidakaList } from "../utils";
import useModal from "../useModal";

// 出来高算定（包括評価の対象外）となる手術・検査コード、薬剤、対象患者の一覧
// 出典: 電子点数表「13) 出来高算定手術等コード」（区分 00: 臓器移植手術 / 01: 厚生労働大臣が定めるもの）
export default function DekidakaPanel({ onClose, isMobile }) {
  const modalRef = useModal(onClose);
  const [ft, setFt] = useState("");
  const data = useMemo(() => getDekidakaList(), []);
  const qn = normalize(ft);
  const hit = (s) => !qn || normalize(s).includes(qn);
  const ops = data.codes.filter(c => c.kind === "手術" && (hit(c.code) || hit(c.name)));
  const others = data.codes.filter(c => c.kind !== "手術" && (hit(c.code) || hit(c.name)));
  const drugs = data.drugs.filter(hit);
  const patients = data.patients.filter(hit);
  const total = ops.length + others.length + drugs.length + patients.length;

  const Section = ({ title, count, children }) => count > 0 ? (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#262626", marginBottom: 4 }}>{title}<span style={{ color: "#737373", fontWeight: 400, marginLeft: 6 }}>{count}件</span></div>
      {children}
    </div>
  ) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="出来高算定（包括対象外）一覧" style={{ background: "#FFFFFF", borderRadius: isMobile ? 0 : 12, border: isMobile ? "none" : "1px solid #E0E0E0", boxShadow: isMobile ? "none" : "0 16px 48px rgba(0,0,0,.12)", maxWidth: isMobile ? "100vw" : "90vw", width: isMobile ? "100%" : 680, maxHeight: isMobile ? "100dvh" : "85vh", height: isMobile ? "100dvh" : "auto", display: "flex", flexDirection: "column", padding: isMobile ? 12 : 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#262626" }}>出来高算定（包括対象外）一覧</div>
            <div style={{ fontSize: 12, color: "#737373" }}>電子点数表「出来高算定手術等コード」{D.meta?.asOf ? `（${D.meta.asOf.slice(0, 4)}/${D.meta.asOf.slice(4, 6)}/${D.meta.asOf.slice(6, 8)} 更新分まで）` : ""}</div>
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{ background: "#F5F5F5", border: "none", color: "#737373", cursor: "pointer", width: 40, height: 40, borderRadius: 8, transition: "background .15s", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => e.currentTarget.style.background = "#E8E8E8"} onMouseLeave={e => e.currentTarget.style.background = "#F5F5F5"}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </div>
        <label htmlFor="dk-filter" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>コードまたは名称で絞り込み</label>
        <input id="dk-filter" value={ft} onChange={e => setFt(e.target.value)} placeholder="コードまたは名称で絞り込み..."
          style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E0E0E0", borderRadius: 6, background: "#FFFFFF", color: "#404040", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8, transition: "border-color .15s, box-shadow .15s" }}
          onFocus={e => { e.target.style.borderColor = "#404040"; e.target.style.boxShadow = "0 0 0 3px rgba(64,64,64,.1)"; }} onBlur={e => { e.target.style.borderColor = "#E0E0E0"; e.target.style.boxShadow = "none"; }} />
        <div style={{ fontSize: 11, color: "#737373", marginBottom: 4 }}>{total}件</div>
        <div style={{ flex: 1, overflow: "auto", background: "#FAFAFA", borderRadius: 6, padding: 10 }}>
          <Section title="手術（Kコード）" count={ops.length}>
            {ops.map(c => (
              <div key={c.code} style={{ fontSize: 13, color: "#404040", padding: "3px 0", display: "flex", gap: 8, borderBottom: "1px solid #F0F0F0" }}>
                <span style={{ color: "#EF4444", fontFamily: M, flexShrink: 0, minWidth: 72, fontSize: 12 }}>{c.code}</span>
                <span>{c.name}</span>
              </div>
            ))}
          </Section>
          <Section title="検査等（Kコード以外）" count={others.length}>
            {others.map(c => (
              <div key={c.code} style={{ fontSize: 13, color: "#404040", padding: "3px 0", display: "flex", gap: 8, borderBottom: "1px solid #F0F0F0" }}>
                <span style={{ color: "#EF4444", fontFamily: M, flexShrink: 0, minWidth: 72, fontSize: 12 }}>{c.code}</span>
                <span>{c.name}</span>
              </div>
            ))}
          </Section>
          <Section title="薬剤（厚生労働大臣が定めるもの）" count={drugs.length}>
            {drugs.map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: "#404040", padding: "4px 0", borderBottom: "1px solid #F0F0F0", lineHeight: 1.5 }}>{t}</div>
            ))}
          </Section>
          <Section title="対象患者" count={patients.length}>
            {patients.map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: "#404040", padding: "4px 0", borderBottom: "1px solid #F0F0F0", lineHeight: 1.5 }}>{t}</div>
            ))}
          </Section>
          {total === 0 && <div style={{ fontSize: 13, color: "#737373", textAlign: "center", padding: 20 }}>一致する項目がありません</div>}
        </div>
      </div>
    </div>
  );
}
