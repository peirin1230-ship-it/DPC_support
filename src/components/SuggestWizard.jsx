import { useState, useCallback, useId } from "react";
import { searchDPC, expandForSuggest, searchDisease, searchSurg, searchProc, searchDrug, isDekidakaOp, findClsInfo, getNoResultHints, icdWarning, NON_SURGERY_NOTE, resolveIcdInput, icdNotFoundMessage, ICD_M_WILDCARD_NOTE, SUSPECT_NOTE } from "../utils";
import { D } from "../data";
import { M } from "../styles";
import AC from "./AC";

export default function SuggestWizard({ onSearch, onReset: parentReset }) {
  // 検索1/検索2 の2インスタンスが同時にマウントされるため、id は useId で一意にする
  const uid = useId();
  const stayId = `sg-stay-days${uid}`, errId = `sg-err-msg${uid}`;
  const [icdIn, setIcdIn] = useState(""); const [selIcd, setSelIcd] = useState("");
  const [surgIn, setSurgIn] = useState(""); const [selSurg, setSelSurg] = useState("");
  const [procIn, setProcIn] = useState(""); const [selProc, setSelProc] = useState("");
  const [drugIn, setDrugIn] = useState(""); const [selDrug, setSelDrug] = useState("");
  const [stayDays, setStayDays] = useState("");
  const [dekidakaWarn, setDekidakaWarn] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [noResultHints, setNoResultHints] = useState(null);

  const doSearch = useCallback(() => {
    let icd = selIcd; let suspected = false;
    if (!icd && icdIn.trim()) {
      // 候補未選択のまま検索された場合: コード形式ならそのまま、病名テキストは一意/分類名一致のときだけ採用
      const rs = resolveIcdInput(icdIn);
      suspected = rs.suspected;
      if (rs.code) { icd = rs.code; if (rs.adopted) { setIcdIn(`${rs.code} ${rs.name}`); setSelIcd(rs.code); } }
      else {
        setErrMsg(rs.reason === "ambiguous" ? `「${icdIn.trim()}」に一致する病名候補が複数あります。候補一覧から選択してください。` : `「${icdIn.trim()}」に一致する病名・ICD-10がありません。分類名（例: 肺炎等）やICD-10コードで検索してください。`);
        setNoResultHints(null); setInfoMsg(""); return;
      }
    } else if (selIcd) { suspected = /(疑い|疑)$/.test(icdIn.trim()); }
    const p = {};
    if (icd) p.icdCode = icd;
    if (selSurg) p.surgeryCode = selSurg;
    if (selProc) p.procAnyCode = selProc;
    if (selDrug) p.drugCode = selDrug;
    if (!p.icdCode && !p.surgeryCode && !p.procAnyCode && !p.drugCode) {
      setErrMsg("少なくとも1つの条件を入力してください"); setNoResultHints(null); setInfoMsg(""); return;
    }
    const sd = Math.max(0, parseInt(stayDays) || 0); // 入院日数は任意（未入力なら期間Ⅰ点数順で候補を表示）
    let mWildcard = false;
    if (p.icdCode) {
      const info = findClsInfo(p.icdCode);
      mWildcard = info.mWildcard;
      if (info.cls.length === 0) {
        setErrMsg(icdNotFoundMessage(p.icdCode)); setNoResultHints(null); setInfoMsg(""); return;
      }
    }
    setErrMsg("");
    if (selSurg && isDekidakaOp(selSurg)) {
      setDekidakaWarn(`${selSurg} は包括評価対象外の手術です。`);
    } else { setDekidakaWarn(""); }
    const r = searchDPC(p);
    if (r.length === 0) {
      const hints = getNoResultHints(p);
      setNoResultHints(hints && hints.evalItems.length > 0 ? { hints, params: p } : null);
      setErrMsg("該当するDPCがありません");
      setInfoMsg("");
      onSearch([], sd, selSurg || ""); return;
    }
    setNoResultHints(null);
    const combos = [...new Set(r.flatMap(x => x.comboHint || []))];
    const notes = [];
    if (mWildcard) notes.push(ICD_M_WILDCARD_NOTE);
    if (suspected) notes.push(SUSPECT_NOTE);
    if (r.some(x => x.surgFallback)) notes.push(`${selSurg} はこの分類の定義テーブルにない手術のため、「その他の手術あり（97）」として候補を絞り込みます。準用手術は準用元のKコードで判断します（通知 第2の1(6)）。`);
    if (r.some(x => x.surgExcluded)) notes.push(NON_SURGERY_NOTE);
    if (combos.length) notes.push(`組み合わせ手術（${combos.join("、")}）は並列された全ての手術を実施した場合のみ該当します（通知 第2の3(4)）。該当する場合は手術欄で組み合わせを選択してください。`);
    setInfoMsg(notes.join(" "));
    const sg = expandForSuggest(r, p);
    onSearch(sg.expanded, sd, selSurg || "");
  }, [selIcd, icdIn, selSurg, selProc, selDrug, onSearch, stayDays]);

  const doReset = () => {
    setIcdIn(""); setSelIcd(""); setSurgIn(""); setSelSurg("");
    setProcIn(""); setSelProc(""); setDrugIn(""); setSelDrug("");
    setStayDays(""); setErrMsg(""); setDekidakaWarn(""); setInfoMsg(""); setNoResultHints(null);
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
        <label htmlFor={stayId} style={{ display: "block", fontSize: 11, color: "#737373", marginBottom: 3, fontWeight: 600 }}>入院日数（任意）</label>
        <input id={stayId} className="sg-stay-days" type="number" min="1" max="365" value={stayDays} onChange={e => setStayDays(e.target.value)} placeholder="例: 14（未入力なら期間Ⅰ点数順）"
          aria-describedby={errMsg ? errId : undefined}
          style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #E0E0E0", borderRadius: 6, background: "#FFFFFF", color: "#404040", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s" }}
          onFocus={e => { e.target.style.borderColor = "#404040"; e.target.style.boxShadow = "0 0 0 3px rgba(64,64,64,.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#E0E0E0"; e.target.style.boxShadow = "none"; }} />
      </div>
      {dekidakaWarn && <div role="alert" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#EF4444" }}>{dekidakaWarn}</div>}
      {(() => { const w = icdWarning(selIcd || icdIn.trim()); return w ? <div role="alert" style={{ background: w.level === "forbid" ? "rgba(239,68,68,.08)" : "#FFFBEB", border: w.level === "forbid" ? "1px solid rgba(239,68,68,.25)" : "1px solid #FDE68A", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: w.level === "forbid" ? "#B91C1C" : "#92400E" }}>{w.text}</div> : null; })()}
      {infoMsg && <div role="status" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#92400E" }}>{infoMsg}</div>}
      {errMsg && <div id={errId} role="alert" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#EF4444" }}>{errMsg}</div>}
      {noResultHints && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, color: "#404040", fontWeight: 600, marginBottom: 10 }}>
            <span style={{ fontFamily: M, color: "#3B82F6" }}>{noResultHints.hints.code}</span>
            {noResultHints.hints.name && <span style={{ color: "#737373", fontWeight: 400 }}> ({noResultHints.hints.name})</span>}
            <span> が評価される条件：</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(() => {
              const grouped = {};
              for (const it of noResultHints.hints.evalItems) { const k = `${it.cls}_${it.branch}`; if (!grouped[k]) grouped[k] = { cls: it.cls, clsName: it.clsName, branch: it.branch, surgs: [] }; grouped[k].surgs.push(it); }
              return Object.values(grouped).map((g, i) => (
                <div key={i} style={{ background: "#FAFAFA", borderRadius: 6, padding: "10px 12px", border: "1px solid #F0F0F0" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#404040", marginBottom: 4 }}>
                    <span style={{ fontFamily: M, color: "#3B82F6" }}>{g.cls}</span>
                    <span style={{ marginLeft: 6 }}>{g.clsName}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#10B981", fontWeight: 500 }}>({g.branch})</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {g.surgs.map((s, j) => (
                      <span key={j} style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 4, padding: "3px 8px", fontSize: 12, color: "#404040" }}>
                        {s.surgName || (s.surgVal === "xx" ? "手術による分岐なし" : `手術区分${s.surgVal}`)}
                      </span>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
          {noResultHints.params.surgeryCode && <div style={{ marginTop: 10, fontSize: 12, color: "#737373" }}>入力した手術（<span style={{ fontFamily: M, color: "#3B82F6" }}>{noResultHints.params.surgeryCode}</span>）とは異なる手術区分で評価されるため、組み合わせでは該当がありません。</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={doReset} style={{ flex: 1, padding: "10px 14px", background: "#F2F2F2", border: "1px solid #E0E0E0", borderRadius: 6, color: "#737373", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "background .15s" }}>クリア</button>
        <button onClick={doSearch} style={{ flex: 1, padding: "10px 22px", background: "#262626", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, transition: "background .15s" }}>検索</button>
      </div>
    </div>
  );
}
