import { useState, useMemo } from "react";
import { D } from "../data";
import { F, M } from "../styles";
import { calcTotal, totalVal, isDekidakaOp, searchDPC, searchDisease, searchSurg, searchProc, searchDrug, getExpandedResults, filterDrillDown, getBranchOptions, MDC_NAMES, getSubdiagICDs, buildResultFromCode, findCls } from "../utils";
import { addHistory, getFavorites, addFavorite, removeFavorite } from "../storage";
import AC from "./AC";
import IcdPanel from "./IcdPanel";
import CompareModal from "./CompareModal";
import Detail from "./Detail";
import DrillDown from "./DrillDown";
import HistoryPanel from "./HistoryPanel";

export default function DPCTool(){
  const[icdIn,setIcdIn]=useState("");const[selIcd,setSelIcd]=useState("");
  const[surgIn,setSurgIn]=useState("");const[selSurg,setSelSurg]=useState("");
  const[procIn,setProcIn]=useState("");const[selProc,setSelProc]=useState("");
  const[drugIn,setDrugIn]=useState("");const[selDrug,setSelDrug]=useState("");
  const[stayDays,setStayDays]=useState("");
  const[results,setResults]=useState([]);const[searched,setSearched]=useState(false);
  const[cmpList,setCmpList]=useState([]);const[showCmp,setShowCmp]=useState(false);
  const[detail,setDetail]=useState(null);
  const[sortMode,setSortMode]=useState("total");
  const[showIcd,setShowIcd]=useState(false);
  const[dekidakaWarn,setDekidakaWarn]=useState("");
  const[expandedDPCs,setExpandedDPCs]=useState([]);
  const[drillP1,setDrillP1]=useState(null);const[drillP2,setDrillP2]=useState(null);
  const[mdcFilter,setMdcFilter]=useState("");
  const[showHistory,setShowHistory]=useState(false);
  const[favSet,setFavSet]=useState(()=>new Set(getFavorites().map(f=>f.code)));

  const doSearch=()=>{
    const icd=selIcd||icdIn.trim();const p={};
    if(icd)p.icdCode=icd;
    if(selSurg)p.surgeryCode=selSurg;
    if(selProc)p.procAnyCode=selProc;
    if(selDrug)p.drugCode=selDrug;
    if(!p.icdCode&&!p.surgeryCode&&!p.procAnyCode&&!p.drugCode)return;
    if(selSurg&&isDekidakaOp(selSurg)){setDekidakaWarn(`${selSurg}（${D.cn[selSurg]||""}）は包括評価対象外の手術です。出来高で算定されます。`);}
    else{setDekidakaWarn("");}
    const r=searchDPC(p);
    setResults(r);setSearched(true);
    setExpandedDPCs(getExpandedResults(r));
    setDrillP1(null);setDrillP2(null);
    const parts=[];
    if(icd)parts.push(icd);if(selSurg)parts.push(selSurg);if(selProc)parts.push(selProc);if(selDrug)parts.push(selDrug);
    addHistory({key:parts.join("|"),icd:icdIn.trim()||"",surg:surgIn.trim()||"",proc:procIn.trim()||"",drug:drugIn.trim()||"",
      selIcd:icd,selSurg:selSurg||"",selProc:selProc||"",selDrug:selDrug||"",
      count:r.length,label:parts.join(" + ")});
  };
  const doReset=()=>{
    setIcdIn("");setSelIcd("");setSurgIn("");setSelSurg("");
    setProcIn("");setSelProc("");setDrugIn("");setSelDrug("");
    setStayDays("");setResults([]);setSearched(false);setCmpList([]);setDekidakaWarn("");
    setExpandedDPCs([]);setDrillP1(null);setDrillP2(null);setMdcFilter("");
  };
  const toggleCmp=r=>{setCmpList(p=>{if(p.find(x=>x.code===r.code))return p.filter(x=>x.code!==r.code);if(p.length>=4)return p;return[...p,r];});};
  const toggleFav=r=>{
    if(favSet.has(r.code)){removeFavorite(r.code);setFavSet(s=>{const n=new Set(s);n.delete(r.code);return n;});}
    else{addFavorite(r.code,r.clsName,r.surgeryName);setFavSet(s=>new Set(s).add(r.code));}
  };
  const restoreSearch=h=>{
    setIcdIn(h.icd||"");setSelIcd(h.selIcd||"");
    setSurgIn(h.surg||"");setSelSurg(h.selSurg||"");
    setProcIn(h.proc||"");setSelProc(h.selProc||"");
    setDrugIn(h.drug||"");setSelDrug(h.selDrug||"");
    setTimeout(()=>{
      const p={};if(h.selIcd)p.icdCode=h.selIcd;if(h.selSurg)p.surgeryCode=h.selSurg;
      if(h.selProc)p.procAnyCode=h.selProc;if(h.selDrug)p.drugCode=h.selDrug;
      if(!p.icdCode&&!p.surgeryCode&&!p.procAnyCode&&!p.drugCode)return;
      const r=searchDPC(p);setResults(r);setSearched(true);
      setExpandedDPCs(getExpandedResults(r));setDrillP1(null);setDrillP2(null);
    },0);
  };
  const jumpToCode=code=>{
    const r=buildResultFromCode(code);if(!r)return;setDetail(r);
  };

  const{displayed:displayedResults,options:branchOptions,total:totalCount}=useMemo(()=>{
    const fe=mdcFilter?expandedDPCs.filter(r=>r.cls.slice(0,2)===mdcFilter):expandedDPCs;
    const disp=(!drillP1&&!drillP2)?fe:filterDrillDown(fe,drillP1,drillP2);
    const opts=(searched&&fe.length>0)?getBranchOptions(fe,drillP1,drillP2):{p1Items:[],p2Items:[]};
    return{displayed:disp,options:opts,total:fe.length};
  },[expandedDPCs,drillP1,drillP2,mdcFilter,searched]);

  const sd=parseInt(stayDays)||0;
  const cv36=v=>parseInt(v,36)||0;
  const sorted=[...displayedResults].sort((a,b)=>{
    if(sortMode==="period")return(b.days[2]||0)-(a.days[2]||0);
    if(sd>0)return totalVal(b.days,b.points,sd)-totalVal(a.days,a.points,sd);
    // 手術は数字が小さい順（高優先度）、同じ手術なら処置等は大きい順
    const sv=a.surgVal.localeCompare(b.surgVal);if(sv!==0)return sv;
    const p2=cv36(b.p2Val||"0")-cv36(a.p2Val||"0");if(p2!==0)return p2;
    const p1=cv36(b.p1Val||"0")-cv36(a.p1Val||"0");if(p1!==0)return p1;
    return(b.points[0]||0)-(a.points[0]||0);
  });

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0a0f1a",color:"#e2e8f0",fontFamily:F,overflow:"hidden"}}>

      {/* Header */}
      <div style={{background:"#0f1629",borderBottom:"1px solid #1e293b",padding:"10px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <div style={{width:32,height:32,borderRadius:7,background:"linear-gradient(135deg,#38bdf8,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>D</div>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>DPC検索ツール</div>
          <div style={{fontSize:10,color:"#475569"}}>令和6年度 DPC電子点数表 ─ {Object.keys(D.dpc).length.toLocaleString()} DPC ・ {Object.keys(D.icn).length.toLocaleString()} ICD-10 ・ 出来高算定手術{Object.keys(D.dk).length}件</div>
        </div>
      </div>

      {/* Search Panel */}
      <div style={{padding:"12px 20px",flexShrink:0}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
          <AC label="疾患名 / ICD-10" value={icdIn} onChange={v=>{setIcdIn(v);setSelIcd("");}} onSelect={r=>{setIcdIn(`${r.code} ${r.name}`);setSelIcd(r.code);}} searchFn={searchDisease} placeholder="例: 肺炎, I510..." />
          <AC label="手術 Kコード" value={surgIn} onChange={v=>{setSurgIn(v);setSelSurg("");}} onSelect={r=>{setSurgIn(`${r.code} ${r.name}`);setSelSurg(r.code);}} searchFn={searchSurg} placeholder="例: K549..." />
          <AC label="手術・処置等" value={procIn} onChange={v=>{setProcIn(v);setSelProc("");}} onSelect={r=>{setProcIn(`${r.code} ${r.name}`);setSelProc(r.code);}} searchFn={searchProc} placeholder="例: SPECT, E101..." showTag />
          <AC label="薬剤検索" value={drugIn} onChange={v=>{setDrugIn(v);setSelDrug("");}} onSelect={r=>{setDrugIn(`${r.code} ${r.name}`);setSelDrug(r.code);}} searchFn={searchDrug} placeholder="例: リコモジュリン..." />
        </div>
        <div style={{display:"flex",gap:10,marginTop:10,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>入院日数</label>
            <input type="number" min="1" max="365" value={stayDays} onChange={e=>setStayDays(e.target.value)} placeholder="14"
              style={{width:70,padding:"6px 8px",border:"1.5px solid #1e293b",borderRadius:6,background:"#0a0f1a",color:"#e2e8f0",fontSize:14,outline:"none"}}
              onFocus={e=>e.target.style.borderColor="#38bdf8"} onBlur={e=>e.target.style.borderColor="#1e293b"} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>並び替え</label>
            <select value={sortMode} onChange={e=>setSortMode(e.target.value)}
              style={{padding:"6px 8px",border:"1.5px solid #1e293b",borderRadius:6,background:"#0a0f1a",color:"#e2e8f0",fontSize:13,outline:"none",cursor:"pointer"}}>
              <option value="total">総点数順</option>
              <option value="period">DPC期間が長い順</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>MDC</label>
            <select value={mdcFilter} onChange={e=>setMdcFilter(e.target.value)}
              style={{padding:"6px 8px",border:"1.5px solid #1e293b",borderRadius:6,background:"#0a0f1a",color:"#e2e8f0",fontSize:13,outline:"none",cursor:"pointer",maxWidth:160}}>
              <option value="">全て</option>
              {Object.entries(MDC_NAMES).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=><option key={k} value={k}>{k}: {v}</option>)}
            </select>
          </div>
          <button onClick={doSearch} style={{padding:"8px 22px",background:"linear-gradient(135deg,#38bdf8,#0ea5e9)",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>検索</button>
          <button onClick={doReset} style={{padding:"8px 14px",background:"#1e293b",border:"none",borderRadius:6,color:"#94a3b8",cursor:"pointer",fontSize:13}}>クリア</button>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowHistory(v=>!v)} style={{padding:"8px 14px",background:"#1e293b",border:"none",borderRadius:6,color:"#a78bfa",cursor:"pointer",fontSize:13}}>履歴</button>
            {showHistory&&<HistoryPanel onClose={()=>setShowHistory(false)} onRestoreSearch={restoreSearch} onJumpToCode={jumpToCode}
              cmpSet={new Set(cmpList.map(x=>x.code))}
              onAddToCompare={code=>{
                const r=buildResultFromCode(code);if(!r)return;
                setCmpList(p=>{if(p.find(x=>x.code===code))return p.filter(x=>x.code!==code);if(p.length>=4)return p;return[...p,r];});
              }}/>}
          </div>
          {results.length>0&&<button onClick={()=>setShowIcd(true)} style={{padding:"8px 14px",background:"#1e293b",border:"none",borderRadius:6,color:"#8ab4f8",cursor:"pointer",fontSize:13}}>ICD-10一覧</button>}
          {searched&&<span style={{fontSize:13,color:"#64748b"}}>{displayedResults.length>0?`${displayedResults.length}件`:"一致なし"}{(drillP1||drillP2)&&totalCount!==displayedResults.length?` (全${totalCount}件中)`:""}</span>}
          {sortMode==="total"&&!sd&&searched&&displayedResults.length>0&&<span style={{fontSize:11,color:"#ef4444"}}>※入院日数を入力すると総点数でソート</span>}
        </div>
        {dekidakaWarn&&<div style={{marginTop:8,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:6,padding:"8px 12px",fontSize:13,color:"#fca5a5"}}>{dekidakaWarn}</div>}
        {searched&&(branchOptions.p1Items.length>0||branchOptions.p2Items.length>0||drillP1||drillP2)&&(
          <DrillDown options={branchOptions} drillP1={drillP1} drillP2={drillP2}
            onSelectP1={c=>{setDrillP1(c);}}
            onSelectP2={c=>{setDrillP2(c);}}
            onClear={()=>{setDrillP1(null);setDrillP2(null);}} />
        )}
      </div>

      {/* Results */}
      <div style={{flex:1,overflow:"auto",padding:"0 20px 16px"}}>
        {sorted.length>0?(
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {sorted.map(r=>{
              const chk=!!cmpList.find(x=>x.code===r.code);
              const tot=calcTotal(r.days,r.points,sd);
              const tags=[];
              if(r.condLabel)tags.push({l:"条件",v:r.condLabel,c:"#fbbf24"});
              if(r.surgeryName&&r.surgeryName!=="なし")tags.push({l:"手術",v:r.surgeryName});
              if(r.proc1Name&&r.proc1Name!=="-"){const a=r.proc1Name!=="なし";tags.push({l:"処置1",v:r.proc1Name,c:a?"#34d399":undefined,dim:!a});}
              if(r.proc2Name&&r.proc2Name!=="-"){const a=r.proc2Name!=="なし";tags.push({l:"処置2",v:r.proc2Name,c:a?"#34d399":undefined,dim:!a});}
              if(r.subdiagName&&r.subdiagName!=="-"){const a=r.subdiagName!=="なし";const sdIcds=a?getSubdiagICDs(r.cls,r.sdVal):[];const sdSummary=sdIcds.length>0?` (${sdIcds.slice(0,3).map(ic=>ic.code+(ic.isPrefix?"~":"")).join(", ")}${sdIcds.length>3?" 他":""})`:"";tags.push({l:"副傷病",v:r.subdiagName+sdSummary,c:a?"#f97316":undefined,dim:!a});}
              if(r.severity)tags.push({l:"重症度",v:r.severity.label,c:"#fbbf24"});

              return(
                <div key={r.code} style={{background:r.isDekidaka?"#1a0f1f":"#111827",borderRadius:8,border:chk?"2px solid #f59e0b":r.isDekidaka?"1px solid #2d1b3d":"1px solid #1e293b",padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span onClick={e=>{e.stopPropagation();toggleFav(r);}} style={{cursor:"pointer",fontSize:16,flexShrink:0,color:favSet.has(r.code)?"#f59e0b":"#334155",lineHeight:1}} title="お気に入り">{favSet.has(r.code)?"★":"☆"}</span>
                    <input type="checkbox" checked={chk} onChange={()=>toggleCmp(r)} style={{cursor:"pointer",accentColor:"#f59e0b",width:15,height:15,flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontFamily:M,color:r.isDekidaka?"#e879a0":"#38bdf8",fontWeight:700,fontSize:15,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(56,189,248,.3)",textUnderlineOffset:2}} onClick={()=>setDetail(r)}>{r.code}</span>
                        {r.isDekidaka&&<span style={{background:"#ef4444",color:"#fff",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>出来高</span>}
                        <span style={{color:"#94a3b8",fontSize:13}}>{r.clsName}</span>
                      </div>
                      {tags.length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                          {tags.map((t,j)=>(<span key={j} style={{background:"#0a0f1a",borderRadius:4,padding:"2px 7px",fontSize:12,color:t.dim?"#475569":(t.c||"#64748b"),border:t.dim?"1px dashed #334155":"none"}}>{t.l}: <span style={{color:t.dim?"#475569":(t.c||"#cbd5e1"),fontWeight:t.c&&!t.dim?600:400}}>{t.v}</span></span>))}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      {sd>0&&!r.isDekidaka&&tot&&(
                        <div style={{textAlign:"right",marginRight:6}}>
                          <div style={{fontSize:10,color:tot.overDays>0?"#ef4444":"#64748b"}}>{tot.overDays>0?`DPC${tot.d3}日+出来高${tot.overDays}日`:`総点数（${sd}日）`}</div>
                          <div style={{fontFamily:M,fontWeight:700,color:"#f59e0b",fontSize:16}}>{tot.total.toLocaleString()}</div>
                        </div>
                      )}
                      {r.isDekidaka?(
                        <div style={{color:"#ef4444",fontSize:13,fontWeight:600,minWidth:60,textAlign:"center"}}>出来高</div>
                      ):(
                        <div style={{display:"flex",gap:4}}>
                          {r.points.map((p,pi)=>(
                            <div key={pi} style={{textAlign:"center",minWidth:48,background:pi===0?"rgba(56,189,248,.06)":"transparent",borderRadius:5,padding:"3px 4px"}}>
                              <div style={{fontSize:10,color:"#475569"}}>{["Ⅰ","Ⅱ","Ⅲ"][pi]}</div>
                              <div style={{fontFamily:M,fontWeight:pi===0?700:400,color:pi===0?"#38bdf8":"#64748b",fontSize:pi===0?16:13}}>{p?p.toLocaleString():"-"}</div>
                              <div style={{fontSize:9,color:"#334155"}}>{r.days[pi]||"-"}日</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ):!searched?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#334155"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:16,color:"#64748b",fontWeight:500}}>検索条件を入力してください</div>
              <div style={{fontSize:13,marginTop:6}}>疾患名・手術・処置・薬剤のいずれかで検索</div>
            </div>
          </div>
        ):searched?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#334155"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:14,color:"#64748b"}}>{mdcFilter?`MDC ${mdcFilter} に該当するDPCがありません`:"一致するDPCがありません"}</div>
            </div>
          </div>
        ):null}
      </div>

      {/* Comparison Cart Bar */}
      {cmpList.length>0&&(
        <div style={{background:"#1e293b",borderTop:"1px solid #334155",padding:"8px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:12,color:"#94a3b8",fontWeight:600,flexShrink:0}}>比較リスト（{cmpList.length}）</span>
          <div style={{flex:1,display:"flex",gap:6,overflowX:"auto",alignItems:"center"}}>
            {cmpList.map(r=>(
              <div key={r.code} style={{display:"flex",alignItems:"center",gap:4,background:"#0f172a",borderRadius:4,padding:"3px 8px",fontSize:12,flexShrink:0,border:"1px solid #334155"}}>
                <span style={{color:r.isDekidaka?"#e879a0":"#38bdf8",fontFamily:M,fontSize:11}}>{r.code}</span>
                <button onClick={()=>toggleCmp(r)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",padding:0,fontSize:14,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
          {cmpList.length>=2&&<button onClick={()=>setShowCmp(true)} style={{padding:"6px 14px",background:"linear-gradient(135deg,#f59e0b,#d97706)",border:"none",borderRadius:6,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,flexShrink:0}}>比較</button>}
          <button onClick={()=>setCmpList([])} style={{padding:"6px 10px",background:"#334155",border:"none",borderRadius:6,color:"#94a3b8",cursor:"pointer",fontSize:12,flexShrink:0}}>クリア</button>
        </div>
      )}

      {showCmp&&<CompareModal items={cmpList} onClose={()=>setShowCmp(false)} sd={sd}/>}
      {detail&&<Detail r={detail} onClose={()=>setDetail(null)} sd={sd} onSearchCls={targetCls=>{
        const icds=D.icd[targetCls];if(!icds||!icds.length)return;
        const icd=icds[0];
        setIcdIn(`${icd} ${D.icn[icd]||""}`);setSelIcd(icd);
        setSurgIn("");setSelSurg("");setProcIn("");setSelProc("");setDrugIn("");setSelDrug("");
        setDetail(null);
        setTimeout(()=>{
          const r2=searchDPC({icdCode:icd});setResults(r2);setSearched(true);
          setExpandedDPCs(getExpandedResults(r2));setDrillP1(null);setDrillP2(null);
          addHistory({key:icd,icd:`${icd} ${D.icn[icd]||""}`,surg:"",proc:"",drug:"",
            selIcd:icd,selSurg:"",selProc:"",selDrug:"",count:r2.length,label:icd});
        },0);
      }}/>}
      {showIcd&&<IcdPanel results={results} onClose={()=>setShowIcd(false)}/>}
    </div>
  );
}
