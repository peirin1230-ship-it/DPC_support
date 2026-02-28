import { useState, useCallback } from "react";
import { searchDPC, expandForSuggest, searchDisease, searchSurg, searchProc, searchDrug, isDekidakaOp, findCls } from "../utils";
import AC from "./AC";

export default function SuggestWizard({ onSearch, onReset: parentReset }) {
  const [icdIn, setIcdIn] = useState(""); const [selIcd, setSelIcd] = useState("");
  const [surgIn, setSurgIn] = useState(""); const [selSurg, setSelSurg] = useState("");
  const [procIn, setProcIn] = useState(""); const [selProc, setSelProc] = useState("");
  const [drugIn, setDrugIn] = useState(""); const [selDrug, setSelDrug] = useState("");
  const [stayDays, setStayDays] = useState("");
  const [dekidakaWarn, setDekidakaWarn] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const doSearch = useCallback(() => {
    const icd = selIcd || icdIn.trim();
    const p = {};
    if (icd) p.icdCode = icd;
    if (selSurg) p.surgeryCode = selSurg;
    if (selProc) p.procAnyCode = selProc;
    if (selDrug) p.drugCode = selDrug;
    if (!p.icdCode && !p.surgeryCode && !p.procAnyCode && !p.drugCode) {
      setErrMsg("少なくとも1つの条件を入力してください"); return;
    }
    const sd = parseInt(stayDays);
    if (!sd || sd <= 0) {
      setErrMsg("入院日数を入力してください"); return;
    }
    if (p.icdCode) {
      const cls = findCls(p.icdCode);
      if (cls.length === 0 && p.icdCode.match(/^[A-Z]/i)) {
        setErrMsg("このICD-10はDPC対象外です"); return;
      }
    }
    setErrMsg("");
    if (selSurg && isDekidakaOp(selSurg)) {
      setDekidakaWarn(`${selSurg} は包括評価対象外の手術です。`);
    } else { setDekidakaWarn(""); }
    const r = searchDPC(p);
    if (r.length === 0) {
      setErrMsg("該当するDPCがありません");
      onSearch([], sd, null, null, ""); return;
    }
    const sg = expandForSuggest(r);
    onSearch(sg.expanded, sd, sg.minP1, sg.minP2, selSurg || "");
  }, [selIcd, icdIn, selSurg, selProc, selDrug, onSearch, stayDays]);

  const doReset = () => {
    setIcdIn(""); setSelIcd(""); setSurgIn(""); setSelSurg("");
    setProcIn(""); setSelProc(""); setDrugIn(""); setSelDrug("");
    setStayDays(""); setErrMsg(""); setDekidakaWarn("");
    parentReset();
  };

  return (
    <div onKeyDown={e => { if (e.key === "Enter" && e.target.tagName !== "SELECT") { e.preventDefault(); doSearch(); } }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AC label="ICD-10（任意）" value={icdIn} onChange={v => { setIcdIn(v); setSelIcd(""); }} onSelect={r => { setIcdIn(`${r.code} ${r.name}`); setSelIcd(r.code); }} searchFn={searchDisease} placeholder="例: 脳梗塞, I63..." />
      <AC label="手術（Kコード）" value={surgIn} onChange={v => { setSurgIn(v); setSelSurg(""); }} onSelect={r => { setSurgIn(`${r.code} ${r.name}`); setSelSurg(r.code); }} searchFn={searchSurg} placeholder="例: K552-22..." />
      <AC label="手術・処置等" value={procIn} onChange={v => { setProcIn(v); setSelProc(""); }} onSelect={r => { setProcIn(`${r.code} ${r.name}`); setSelProc(r.code); }} searchFn={searchProc} placeholder="例: SPECT, E101..." showTag />
      <AC label="薬剤" value={drugIn} onChange={v => { setDrugIn(v); setSelDrug(""); }} onSelect={r => { setDrugIn(`${r.code} ${r.name}`); setSelDrug(r.code); }} searchFn={searchDrug} placeholder="例: リコモジュリン..." />
      <div>
        <label htmlFor="sg-stay-days" style={{ display: "block", fontSize: 11, color: "#737373", marginBottom: 3, fontWeight: 600 }}>入院日数 <span style={{ color: "#EF4444" }}>*</span></label>
        <input id="sg-stay-days" type="number" min="1" max="365" value={stayDays} onChange={e => setStayDays(e.target.value)} placeholder="14"
          aria-invalid={errMsg && errMsg.includes("入院日数") ? "true" : undefined}
          aria-describedby={errMsg ? "sg-err-msg" : undefined}
          style={{ width: "100%", padding: "8px 10px", border: `1.5px solid ${!stayDays ? "#FCA5A5" : "#E0E0E0"}`, borderRadius: 6, background: "#FFFFFF", color: "#404040", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s" }}
          onFocus={e => { e.target.style.borderColor = "#404040"; e.target.style.boxShadow = "0 0 0 3px rgba(64,64,64,.1)"; }}
          onBlur={e => { e.target.style.borderColor = !stayDays ? "#FCA5A5" : "#E0E0E0"; e.target.style.boxShadow = "none"; }} />
      </div>
      {dekidakaWarn && <div role="alert" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#EF4444" }}>{dekidakaWarn}</div>}
      {errMsg && <div id="sg-err-msg" role="alert" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#EF4444" }}>{errMsg}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={doReset} style={{ flex: 1, padding: "10px 14px", background: "#F2F2F2", border: "1px solid #E0E0E0", borderRadius: 6, color: "#737373", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "background .15s" }}>クリア</button>
        <button onClick={doSearch} style={{ flex: 1, padding: "10px 22px", background: "#262626", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, transition: "background .15s" }}>検索</button>
      </div>
    </div>
  );
}
