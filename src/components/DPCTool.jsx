import { useState } from "react";
import { D } from "../data";
import { F, M } from "../styles";
import { calcTotal, totalVal, isDekidakaOp, searchDPC, searchDisease, searchSurg, searchProc, searchDrug } from "../utils";
import AC from "./AC";
import IcdPanel from "./IcdPanel";
import CompareModal from "./CompareModal";
import Detail from "./Detail";

export default function DPCTool(){
  const[icdIn,setIcdIn]=useState("");const[selIcd,setSelIcd]=useState("");
  const[surgIn,setSurgIn]=useState("");const[selSurg,setSelSurg]=useState("");
  const[procIn,setProcIn]=useState("");const[selProc,setSelProc]=useState("");
  const[drugIn,setDrugIn]=useState("");const[selDrug,setSelDrug]=useState("");
  const[stayDays,setStayDays]=useState("");
  const[results,setResults]=useState([]);const[searched,setSearched]=useState(false);
  const[cmpList,setCmpList]=useState([]);const[showCmp,setShowCmp]=useState(false);
  const[detail,setDetail]=useState(null);
  const[noSurg,setNoSurg]=useState(false);const[sortMode,setSortMode]=useState("total");
  const[showIcd,setShowIcd]=useState(false);
  const[dekidakaWarn,setDekidakaWarn]=useState("");

  const doSearch=()=>{
    const icd=selIcd||icdIn.trim();const p={};
    if(icd)p.icdCode=icd;
    if(noSurg)p.surgeryCode="KKK0";else if(selSurg)p.surgeryCode=selSurg;
    if(selProc)p.procAnyCode=selProc;
    if(selDrug)p.drugCode=selDrug;
    if(!p.icdCode&&!p.surgeryCode&&!p.procAnyCode&&!p.drugCode)return;
    if(selSurg&&isDekidakaOp(selSurg)){setDekidakaWarn(`${selSurg}（${D.cn[selSurg]||""}）は包括評価対象外の手術です。出来高で算定されます。`);}
    else{setDekidakaWarn("");}
    setResults(searchDPC(p));setSearched(true);setCmpList([]);
  };
  const doReset=()=>{
    setIcdIn("");setSelIcd("");setSurgIn("");setSelSurg("");
    setProcIn("");setSelProc("");setDrugIn("");setSelDrug("");
    setStayDays("");setResults([]);setSearched(false);setCmpList([]);setNoSurg(false);setDekidakaWarn("");
  };
  const toggleCmp=r=>{setCmpList(p=>{if(p.find(x=>x.code===r.code))return p.filter(x=>x.code!==r.code);if(p.length>=4)return p;return[...p,r];});};
  const sd=parseInt(stayDays)||0;
  const sorted=[...results].sort((a,b)=>{
    if(sortMode==="period")return(b.days[2]||0)-(a.days[2]||0);
    if(sd>0)return totalVal(b.days,b.points,sd)-totalVal(a.days,a.points,sd);
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
          <div>
            <AC label="手術 Kコード" value={surgIn} onChange={v=>{setSurgIn(v);setSelSurg("");setNoSurg(false);}} onSelect={r=>{setSurgIn(`${r.code} ${r.name}`);setSelSurg(r.code);setNoSurg(false);}} searchFn={searchSurg} placeholder="例: K549..." />
            <label style={{fontSize:12,color:"#64748b",cursor:"pointer",display:"flex",alignItems:"center",gap:5,marginTop:3}}>
              <input type="checkbox" checked={noSurg} onChange={e=>{setNoSurg(e.target.checked);if(e.target.checked){setSurgIn("手術なし");setSelSurg("");}else{setSurgIn("");}}} style={{accentColor:"#38bdf8",width:14,height:14}}/>
              手術なし
            </label>
          </div>
          <AC label="手術・処置等（横断検索）" value={procIn} onChange={v=>{setProcIn(v);setSelProc("");}} onSelect={r=>{setProcIn(`${r.code} ${r.name}`);setSelProc(r.code);}} searchFn={searchProc} placeholder="例: SPECT, E101..." showTag />
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
          <button onClick={doSearch} style={{padding:"8px 22px",background:"linear-gradient(135deg,#38bdf8,#0ea5e9)",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>検索</button>
          <button onClick={doReset} style={{padding:"8px 14px",background:"#1e293b",border:"none",borderRadius:6,color:"#94a3b8",cursor:"pointer",fontSize:13}}>クリア</button>
          {cmpList.length>=2&&<button onClick={()=>setShowCmp(true)} style={{padding:"8px 14px",background:"linear-gradient(135deg,#f59e0b,#d97706)",border:"none",borderRadius:6,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13}}>比較（{cmpList.length}）</button>}
          {results.length>0&&<button onClick={()=>setShowIcd(true)} style={{padding:"8px 14px",background:"#1e293b",border:"none",borderRadius:6,color:"#8ab4f8",cursor:"pointer",fontSize:13}}>ICD-10一覧</button>}
          {searched&&<span style={{fontSize:13,color:"#64748b"}}>{results.length>0?`${results.length}件`:"一致なし"}</span>}
          {sortMode==="total"&&!sd&&searched&&results.length>0&&<span style={{fontSize:11,color:"#ef4444"}}>※入院日数を入力すると総点数でソート</span>}
        </div>
        {dekidakaWarn&&<div style={{marginTop:8,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:6,padding:"8px 12px",fontSize:13,color:"#fca5a5"}}>{dekidakaWarn}</div>}
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
              if(r.proc1Name&&r.proc1Name!=="なし"&&r.proc1Name!=="-")tags.push({l:"処置1",v:r.proc1Name});
              if(r.proc2Name&&r.proc2Name!=="なし"&&r.proc2Name!=="-")tags.push({l:"処置2",v:r.proc2Name});
              if(r.subdiagName&&r.subdiagName!=="なし"&&r.subdiagName!=="-")tags.push({l:"副傷病",v:r.subdiagName});
              if(r.severity)tags.push({l:"重症度",v:r.severity.label,c:"#fbbf24"});

              return(
                <div key={r.code} style={{background:r.isDekidaka?"#1a0f1f":"#111827",borderRadius:8,border:chk?"2px solid #f59e0b":r.isDekidaka?"1px solid #2d1b3d":"1px solid #1e293b",padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="checkbox" checked={chk} onChange={()=>toggleCmp(r)} style={{cursor:"pointer",accentColor:"#f59e0b",width:15,height:15,flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontFamily:M,color:r.isDekidaka?"#e879a0":"#38bdf8",fontWeight:700,fontSize:15,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(56,189,248,.3)",textUnderlineOffset:2}} onClick={()=>setDetail(r)}>{r.code}</span>
                        {r.isDekidaka&&<span style={{background:"#ef4444",color:"#fff",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>出来高</span>}
                        <span style={{color:"#94a3b8",fontSize:13}}>{r.clsName}</span>
                      </div>
                      {tags.length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                          {tags.map((t,j)=>(<span key={j} style={{background:"#0a0f1a",borderRadius:4,padding:"2px 7px",fontSize:12,color:t.c||"#64748b"}}>{t.l}: <span style={{color:t.c||"#cbd5e1"}}>{t.v}</span></span>))}
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
        ):null}
      </div>

      {showCmp&&<CompareModal items={cmpList} onClose={()=>setShowCmp(false)} sd={sd}/>}
      {detail&&<Detail r={detail} onClose={()=>setDetail(null)} sd={sd}/>}
      {showIcd&&<IcdPanel results={results} onClose={()=>setShowIcd(false)}/>}
    </div>
  );
}
