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
    const sv=a.surgVal.localeCompare(b.surgVal);if(sv!==0)return sv;
    const p2=cv36(b.p2Val||"0")-cv36(a.p2Val||"0");if(p2!==0)return p2;
    const p1=cv36(b.p1Val||"0")-cv36(a.p1Val||"0");if(p1!==0)return p1;
    return(b.points[0]||0)-(a.points[0]||0);
  });

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#F2F2F2",color:"#404040",fontFamily:F,overflow:"hidden"}}>

      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E0E0E0",padding:"10px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <div style={{width:32,height:32,borderRadius:7,background:"#262626",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>D</div>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:"#262626"}}>DPC検索ツール</div>
          <div style={{fontSize:10,color:"#737373"}}>令和6年度 DPC電子点数表 ─ {Object.keys(D.dpc).length.toLocaleString()} DPC ・ {Object.keys(D.icn).length.toLocaleString()} ICD-10 ・ 出来高算定手術{Object.keys(D.dk).length}件</div>
        </div>
      </div>

      {/* Main Content - 2 Column Layout */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Left Column: Search Zone */}
        <aside onKeyDown={e=>{if(e.key==="Enter"&&e.target.tagName!=="SELECT"){e.preventDefault();doSearch();}}} style={{width:320,flexShrink:0,background:"#FFFFFF",borderRight:"1px solid #E0E0E0",overflow:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
          <AC label="ICD-10（病名）" value={icdIn} onChange={v=>{setIcdIn(v);setSelIcd("");}} onSelect={r=>{setIcdIn(`${r.code} ${r.name}`);setSelIcd(r.code);}} searchFn={searchDisease} placeholder="例: 肺炎, I510..." />
          <AC label="手術（Kコード）" value={surgIn} onChange={v=>{setSurgIn(v);setSelSurg("");}} onSelect={r=>{setSurgIn(`${r.code} ${r.name}`);setSelSurg(r.code);}} searchFn={searchSurg} placeholder="例: K549..." />
          <AC label="手術・処置等" value={procIn} onChange={v=>{setProcIn(v);setSelProc("");}} onSelect={r=>{setProcIn(`${r.code} ${r.name}`);setSelProc(r.code);}} searchFn={searchProc} placeholder="例: SPECT, E101..." showTag />
          <AC label="薬剤検索" value={drugIn} onChange={v=>{setDrugIn(v);setSelDrug("");}} onSelect={r=>{setDrugIn(`${r.code} ${r.name}`);setSelDrug(r.code);}} searchFn={searchDrug} placeholder="例: リコモジュリン..." />

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div>
              <label style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>入院日数</label>
              <input type="number" min="1" max="365" value={stayDays} onChange={e=>setStayDays(e.target.value)} placeholder="14"
                style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:14,outline:"none",transition:"border-color .15s, box-shadow .15s"}}
                onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}} />
            </div>
            <div>
              <label style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>並び替え</label>
              <select value={sortMode} onChange={e=>setSortMode(e.target.value)}
                style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",cursor:"pointer",transition:"border-color .15s, box-shadow .15s"}}
                onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}}>
                <option value="total">総点数順</option>
                <option value="period">DPC期間が長い順</option>
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>MDC</label>
              <select value={mdcFilter} onChange={e=>setMdcFilter(e.target.value)}
                style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",cursor:"pointer",transition:"border-color .15s, box-shadow .15s"}}
                onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}}>
                <option value="">全て</option>
                {Object.entries(MDC_NAMES).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=><option key={k} value={k}>{k}: {v}</option>)}
              </select>
            </div>
          </div>

          {dekidakaWarn&&<div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:6,padding:"8px 12px",fontSize:13,color:"#EF4444"}}>{dekidakaWarn}</div>}

          {sortMode==="total"&&!sd&&searched&&displayedResults.length>0&&<div style={{fontSize:11,color:"#EF4444"}}>※入院日数を入力すると総点数でソート</div>}

          <div style={{display:"flex",gap:8}}>
            <button onClick={doReset} style={{flex:1,padding:"10px 14px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:13,fontWeight:500,transition:"background .15s"}}>クリア</button>
            <button onClick={doSearch} style={{flex:1,padding:"10px 22px",background:"#262626",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,transition:"background .15s"}}>検索</button>
          </div>
        </aside>

        {/* Right Column: Results Zone */}
        <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* DrillDown + Toolbar */}
          <div style={{padding:"12px 20px",flexShrink:0}}>
            {searched&&(branchOptions.p1Items.length>0||branchOptions.p2Items.length>0||drillP1||drillP2)&&(
              <DrillDown options={branchOptions} drillP1={drillP1} drillP2={drillP2}
                onSelectP1={c=>{setDrillP1(c);}}
                onSelectP2={c=>{setDrillP2(c);}}
                onClear={()=>{setDrillP1(null);setDrillP2(null);}} />
            )}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:searched&&(branchOptions.p1Items.length>0||branchOptions.p2Items.length>0||drillP1||drillP2)?8:0}}>
              {results.length>0&&<button onClick={()=>setShowIcd(true)} style={{padding:"6px 12px",background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:6,color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:500,transition:"background .15s, border-color .15s"}}>ICD-10一覧</button>}
              <div style={{position:"relative"}}>
                <button onClick={()=>setShowHistory(v=>!v)} style={{padding:"6px 12px",background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:12,fontWeight:500,transition:"background .15s, border-color .15s"}}>履歴</button>
                {showHistory&&<HistoryPanel onClose={()=>setShowHistory(false)} onRestoreSearch={restoreSearch} onJumpToCode={jumpToCode}
                  cmpSet={new Set(cmpList.map(x=>x.code))}
                  onAddToCompare={code=>{
                    const r=buildResultFromCode(code);if(!r)return;
                    setCmpList(p=>{if(p.find(x=>x.code===code))return p.filter(x=>x.code!==code);if(p.length>=4)return p;return[...p,r];});
                  }}/>}
              </div>
              {searched&&<span style={{fontSize:13,color:"#737373"}}>{displayedResults.length>0?`${displayedResults.length}件`:"一致なし"}{(drillP1||drillP2)&&totalCount!==displayedResults.length?` (全${totalCount}件中)`:""}</span>}
            </div>
          </div>

          {/* Results */}
          <div style={{flex:1,overflow:"auto",padding:"0 20px 16px"}}>
            {sorted.length>0?(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {sorted.map(r=>{
                  const chk=!!cmpList.find(x=>x.code===r.code);
                  const tot=calcTotal(r.days,r.points,sd);
                  const tags=[];
                  if(r.condLabel)tags.push({l:"条件",v:r.condLabel,c:"#F59E0B"});
                  if(r.surgeryName&&r.surgeryName!=="なし")tags.push({l:"手術",v:r.surgeryName});
                  if(r.proc1Name&&r.proc1Name!=="-"){const a=r.proc1Name!=="なし";tags.push({l:"処置1",v:r.proc1Name,c:a?"#10B981":undefined,dim:!a});}
                  if(r.proc2Name&&r.proc2Name!=="-"){const a=r.proc2Name!=="なし";tags.push({l:"処置2",v:r.proc2Name,c:a?"#10B981":undefined,dim:!a});}
                  if(r.subdiagName&&r.subdiagName!=="-"){const a=r.subdiagName!=="なし";const sdIcds=a?getSubdiagICDs(r.cls,r.sdVal):[];const sdSummary=sdIcds.length>0?` (${sdIcds.slice(0,3).map(ic=>ic.code+(ic.isPrefix?"~":"")).join(", ")}${sdIcds.length>3?" 他":""})`:"";tags.push({l:"副傷病",v:r.subdiagName+sdSummary,c:a?"#EA580C":undefined,dim:!a});}
                  if(r.severity)tags.push({l:"重症度",v:r.severity.label,c:"#F59E0B"});

                  return(
                    <div key={r.code} style={{background:r.isDekidaka?"#FFF7ED":"#FFFFFF",borderRadius:8,border:chk?"2px solid #F59E0B":r.isDekidaka?"1px solid #FECACA":"1px solid #E0E0E0",padding:"10px 12px",transition:"border-color .15s, box-shadow .15s"}}
                      onMouseEnter={e=>{if(!chk)e.currentTarget.style.borderColor="#D4D4D4";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)";}}
                      onMouseLeave={e=>{if(!chk)e.currentTarget.style.borderColor=r.isDekidaka?"#FECACA":"#E0E0E0";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={e=>{e.stopPropagation();toggleFav(r);}} aria-label={favSet.has(r.code)?"お気に入りから削除":"お気に入りに追加"} style={{cursor:"pointer",fontSize:16,flexShrink:0,color:favSet.has(r.code)?"#F59E0B":"#D4D4D4",lineHeight:1,background:"none",border:"none",padding:0}} title="お気に入り">{favSet.has(r.code)?"★":"☆"}</button>
                        <label style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,cursor:"pointer",flexShrink:0,margin:0}} title="比較に追加"><input type="checkbox" checked={chk} onChange={()=>toggleCmp(r)} style={{cursor:"pointer",accentColor:"#F59E0B",width:15,height:15}} /></label>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontFamily:M,color:r.isDekidaka?"#E11D48":"#3B82F6",fontWeight:700,fontSize:15,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(59,130,246,.3)",textUnderlineOffset:2}} onClick={()=>setDetail(r)}>{r.code}</span>
                            {r.isDekidaka&&<span style={{background:"#EF4444",color:"#fff",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>出来高</span>}
                            <span style={{color:"#737373",fontSize:13}}>{r.clsName}</span>
                          </div>
                          {tags.length>0&&(
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                              {tags.map((t,j)=>(<span key={j} style={{background:"#FAFAFA",borderRadius:4,padding:"2px 7px",fontSize:12,color:t.dim?"#737373":(t.c||"#737373"),border:t.dim?"1px dashed #E0E0E0":"1px solid #F0F0F0"}}>{t.l}: <span style={{color:t.dim?"#737373":(t.c||"#404040"),fontWeight:t.c&&!t.dim?600:400}}>{t.v}</span></span>))}
                            </div>
                          )}
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                          {sd>0&&!r.isDekidaka&&tot&&(
                            <div style={{textAlign:"right",marginRight:6}}>
                              <div style={{fontSize:10,color:tot.overDays>0?"#EF4444":"#737373"}}>{tot.overDays>0?`DPC${tot.d3}日+出来高${tot.overDays}日`:`総点数（${sd}日）`}</div>
                              <div style={{fontFamily:M,fontWeight:700,color:"#F59E0B",fontSize:16}}>{tot.total.toLocaleString()}</div>
                            </div>
                          )}
                          {r.isDekidaka?(
                            <div style={{color:"#EF4444",fontSize:13,fontWeight:600,minWidth:60,textAlign:"center"}}>出来高</div>
                          ):(
                            <div style={{display:"flex",gap:4}}>
                              {r.points.map((p,pi)=>(
                                <div key={pi} style={{textAlign:"center",minWidth:48,background:pi===0?"rgba(59,130,246,.06)":"transparent",borderRadius:5,padding:"3px 4px"}}>
                                  <div style={{fontSize:10,color:"#737373"}}>{["Ⅰ","Ⅱ","Ⅲ"][pi]}</div>
                                  <div style={{fontFamily:M,fontWeight:pi===0?700:400,color:pi===0?"#3B82F6":"#737373",fontSize:pi===0?16:13}}>{p?p.toLocaleString():"-"}</div>
                                  <div style={{fontSize:9,color:"#D4D4D4"}}>{r.days[pi]||"-"}日</div>
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#D4D4D4"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,color:"#737373",fontWeight:500}}>検索条件を入力してください</div>
                  <div style={{fontSize:13,marginTop:6}}>疾患名・手術・処置・薬剤のいずれかで検索</div>
                </div>
              </div>
            ):searched?(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#D4D4D4"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:14,color:"#737373"}}>{mdcFilter?`MDC ${mdcFilter} に該当するDPCがありません`:"一致するDPCがありません"}</div>
                </div>
              </div>
            ):null}
          </div>
        </main>
      </div>

      {/* Compare Zone - Bottom */}
      {cmpList.length>0&&(
        <div style={{background:"#FFFFFF",borderTop:"1px solid #E0E0E0",padding:"12px 20px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:13,color:"#262626",fontWeight:600}}>比較ゾーン（{cmpList.length}/4）</span>
            <div style={{display:"flex",gap:8}}>
              {cmpList.length>=2&&<button onClick={()=>setShowCmp(true)} style={{padding:"6px 16px",background:"#262626",border:"none",borderRadius:6,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,flexShrink:0}}>比較</button>}
              <button onClick={()=>setCmpList([])} style={{padding:"6px 12px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:12,flexShrink:0}}>クリア</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:10}}>
            {[0,1,2,3].map(i=>{
              const r=cmpList[i];
              return r?(
                <div key={r.code} style={{background:"#FAFAFA",border:"1px solid #E0E0E0",borderRadius:8,padding:"10px 12px",position:"relative"}}>
                  <div style={{fontFamily:M,color:r.isDekidaka?"#E11D48":"#3B82F6",fontWeight:700,fontSize:13}}>{r.code}</div>
                  <div style={{fontSize:11,color:"#737373",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.clsName}</div>
                  <button onClick={()=>toggleCmp(r)} style={{position:"absolute",top:6,right:6,background:"none",border:"none",color:"#737373",cursor:"pointer",padding:0,fontSize:14,lineHeight:1,transition:"color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#404040"} onMouseLeave={e=>e.currentTarget.style.color="#737373"}>×</button>
                </div>
              ):(
                <div key={i} style={{border:"2px dashed #E0E0E0",borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:52}}>
                  <span style={{color:"#D4D4D4",fontSize:12}}>結果から選択</span>
                </div>
              );
            })}
          </div>
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
