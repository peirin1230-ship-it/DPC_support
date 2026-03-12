import { useState, useMemo, useCallback } from "react";
import { D } from "../data";
import { F, M } from "../styles";
import { calcTotal, totalVal, isDekidakaOp, searchDPC, searchDisease, searchSurg, searchProc, searchDrug, getExpandedResults, filterDrillDown, getBranchOptions, MDC_NAMES, getSubdiagICDs, buildResultFromCode, findCls, getIcdCandidates, getSurgeryOptionsFromResults, getP1OptionsFromResults, getP2OptionsFromResults, getSubdiagOptionsFromResults, getSeverityOptionsFromResults, normalize, getNoResultHints } from "../utils";
import { addHistory, getFavorites, addFavorite, removeFavorite, addFeedback, getFeedbacks, exportFeedbacksJSON } from "../storage";
import useIsMobile from "../useIsMobile";
import AC from "./AC";
import IcdPanel from "./IcdPanel";
import CompareModal from "./CompareModal";
import Detail from "./Detail";
import DrillDown from "./DrillDown";
import HistoryPanel from "./HistoryPanel";
import SuggestWizard from "./SuggestWizard";

function SgOption({o,valueKey,active,onSelect,highlight}){
  const hasCodes=o.codes&&o.codes.length>0;
  const hasIcds=o.icds&&o.icds.length>0;
  const hasClsNames=o.clsNames&&o.clsNames.length>0;
  // highlight: normalized query string — match codes/icds/label
  const matchedCodes=useMemo(()=>{
    if(!highlight||!hasCodes)return null;
    const hits=o.codes.filter(c=>normalize(c.code).includes(highlight)||normalize(c.name||"").includes(highlight));
    return hits.length>0?new Set(hits.map(c=>c.code)):null;
  },[highlight,hasCodes,o.codes]);
  const matchedIcds=useMemo(()=>{
    if(!highlight||!hasIcds)return null;
    const hits=o.icds.filter(ic=>normalize(ic.code).includes(highlight)||normalize(ic.name||"").includes(highlight));
    return hits.length>0?new Set(hits.map(ic=>ic.code)):null;
  },[highlight,hasIcds,o.icds]);
  const labelMatch=highlight&&normalize(o.label||"").includes(highlight);
  const hasMatch=highlight&&(labelMatch||matchedCodes||matchedIcds);
  const dimmed=highlight&&!hasMatch;
  return(
    <button onClick={()=>onSelect(active?null:o[valueKey])}
      style={{display:"flex",flexDirection:"column",gap:4,padding:"12px 16px",
        background:active?"#FAFAFA":hasMatch?"#FEFCE8":"#FFFFFF",
        border:active?"2px solid #3B82F6":hasMatch?"2px solid #F59E0B":"2px solid #E0E0E0",borderRadius:8,cursor:"pointer",textAlign:"left",
        fontSize:14,color:dimmed?"#8B8B8B":"#404040",opacity:dimmed?0.5:1,
        transition:"border-color .15s, background .15s, box-shadow .15s, opacity .15s",width:"100%",boxSizing:"border-box"}}
      onMouseEnter={e=>{if(!active&&!hasMatch){e.currentTarget.style.borderColor="#D4D4D4";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)";}}}
      onMouseLeave={e=>{if(!active&&!hasMatch){e.currentTarget.style.borderColor="#E0E0E0";e.currentTarget.style.boxShadow="none";}}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%"}}>
        <span style={{fontWeight:600,flex:1,paddingRight:8}}>{o.label}{hasMatch&&<span style={{fontSize:10,color:"#F59E0B",fontWeight:700,marginLeft:6}}>一致</span>}</span>
      </div>
      {hasClsNames&&(
        <div style={{fontSize:11,color:"#737373",marginTop:-2}}>
          {o.clsNames.join("、")}
        </div>
      )}
      {hasCodes&&(
        <div style={{maxHeight:120,overflow:"auto",display:"flex",gap:3,flexWrap:"wrap",alignContent:"flex-start"}}>
          {o.codes.map(c=>{
            const hit=matchedCodes&&matchedCodes.has(c.code);
            return(
              <span key={c.code} style={{fontSize:10,color:hit?"#92400E":"#737373",background:hit?"#FEF3C7":"#F5F5F5",borderRadius:3,padding:"1px 5px",fontWeight:hit?700:400}}>
                <span style={{fontFamily:M,color:hit?"#D97706":"#3B82F6"}}>{c.code}</span>
                {c.name&&<span style={{marginLeft:2}}>{c.name}</span>}
              </span>
            );
          })}
        </div>
      )}
      {hasIcds&&(
        <div style={{maxHeight:80,overflow:"auto",display:"flex",gap:3,flexWrap:"wrap",alignContent:"flex-start"}}>
          {o.icds.slice(0,4).map(ic=>{
            const hit=matchedIcds&&matchedIcds.has(ic.code);
            return(
              <span key={ic.code} style={{fontSize:10,color:hit?"#92400E":"#737373",background:hit?"#FEF3C7":"#F5F5F5",borderRadius:3,padding:"1px 5px",fontWeight:hit?700:400}}>
                <span style={{fontFamily:M,color:hit?"#D97706":"#EA580C"}}>{ic.code}{ic.isPrefix?"~":""}</span>
                {ic.name&&<span style={{marginLeft:2}}>{ic.name}</span>}
              </span>
            );
          })}
          {o.icds.length>4&&<span style={{fontSize:10,color:"#A3A3A3",padding:"1px 4px"}}>他{o.icds.length-4}件</span>}
        </div>
      )}
    </button>
  );
}

function SuggestRightPanel({sgExpanded,sgStayDays,sgSearched,sgSurgVal,setSgSurgVal,sgP1Val,setSgP1Val,sgP2Val,setSgP2Val,sgSdVal,setSgSdVal,sgSevVal,setSgSevVal,sgInputSurg,onDetail,cmpList,toggleCmp,isMobile,onRestoreSearch,onJumpToCode}){
  const[stepQuery,setStepQuery]=useState("");
  const[showSgHist,setShowSgHist]=useState(false);
  // When input surgery was selected on the left, filter to only DPCs where
  // the surgery group for that cls contains the input code (per-cls matching)
  const inputSurgFiltered=useMemo(()=>{
    if(!sgInputSurg)return sgExpanded;
    return sgExpanded.filter(r=>{
      const si=D.si?.[r.cls];if(!si)return false;
      const idx=si[r.surgVal];if(idx===undefined)return false;
      return D.sl[idx]?.includes(sgInputSurg);
    });
  },[sgExpanded,sgInputSurg]);
  // p1/p2 constraints are already applied in expandForSuggest (same logic as getExpandedResults)
  const surgOpts=useMemo(()=>sgSearched&&inputSurgFiltered.length>0?getSurgeryOptionsFromResults(inputSurgFiltered):[],[inputSurgFiltered,sgSearched]);
  const effSurg=useMemo(()=>{
    if(sgInputSurg)return"__inputSurg__";
    if(surgOpts.length===1)return surgOpts[0].surgVal;
    return sgSurgVal;
  },[surgOpts,sgSurgVal,sgInputSurg]);
  const afterSurg=useMemo(()=>{
    if(sgInputSurg)return inputSurgFiltered;
    if(effSurg===null)return inputSurgFiltered;
    return inputSurgFiltered.filter(r=>`${r.surgVal}::${r.surgeryName||"なし"}`===effSurg);
  },[inputSurgFiltered,effSurg,sgInputSurg]);
  const p1Opts=useMemo(()=>effSurg===null?null:getP1OptionsFromResults(afterSurg),[afterSurg,effSurg]);
  const effP1=useMemo(()=>{if(!p1Opts||!p1Opts.length)return null;if(p1Opts.length===1)return p1Opts[0].p1Val;return sgP1Val;},[p1Opts,sgP1Val]);
  const afterP1=useMemo(()=>{
    if(effP1===null)return afterSurg;
    return afterSurg.filter(r=>{
      if(!r.hasP1Branch)return effP1.startsWith("0::");
      return`${r.p1Val}::${r.proc1Name||"なし"}`===effP1;
    });
  },[afterSurg,effP1]);
  const p2Opts=useMemo(()=>effSurg===null?null:getP2OptionsFromResults(afterP1),[afterP1,effSurg]);
  const effP2=useMemo(()=>{if(!p2Opts||!p2Opts.length)return null;if(p2Opts.length===1)return p2Opts[0].p2Val;return sgP2Val;},[p2Opts,sgP2Val]);
  const afterP2=useMemo(()=>{
    if(effP2===null)return afterP1;
    return afterP1.filter(r=>{
      if(!r.hasP2Branch)return effP2.startsWith("0::");
      return`${r.p2Val}::${r.proc2Name||"なし"}`===effP2;
    });
  },[afterP1,effP2]);
  const sdOpts=useMemo(()=>effSurg===null?null:getSubdiagOptionsFromResults(afterP2),[afterP2,effSurg]);
  const effSd=useMemo(()=>{if(!sdOpts||!sdOpts.length)return null;if(sdOpts.length===1)return sdOpts[0].sdVal;return sgSdVal;},[sdOpts,sgSdVal]);
  const afterSd=useMemo(()=>effSd===null?afterP2:afterP2.filter(r=>{if(r.subdiagName==="-")return effSd==="0";return r.sdVal===effSd;}),[afterP2,effSd]);
  const sevOpts=useMemo(()=>effSurg===null?null:getSeverityOptionsFromResults(afterSd),[afterSd,effSurg]);
  const effSev=useMemo(()=>{if(!sevOpts||!sevOpts.length)return null;if(sevOpts.length===1)return sevOpts[0].sevVal;return sgSevVal;},[sevOpts,sgSevVal]);
  const afterSev=useMemo(()=>effSev===null?afterSd:afterSd.filter(r=>r.severity&&r.severity.value===effSev),[afterSd,effSev]);

  // Determine current step (needXxx = true only when >1 option = user must choose)
  // When input surgery code is set, surgery step is skipped entirely (per-cls filter)
  const needSurg=surgOpts.length>1&&!sgInputSurg;
  const needP1=p1Opts&&p1Opts.length>1;
  const needP2=p2Opts&&p2Opts.length>1;
  const needSd=sdOpts&&sdOpts.length>1;
  const needSev=sevOpts&&sevOpts.length>1;

  // Which step are we on?
  let currentStep=null;
  if(effSurg===null&&needSurg)currentStep="surg";
  else if(effSurg!==null&&needP1&&effP1===null)currentStep="p1";
  else if(effSurg!==null&&(!needP1||effP1!==null)&&needP2&&effP2===null)currentStep="p2";
  else if(effSurg!==null&&(!needP1||effP1!==null)&&(!needP2||effP2!==null)&&needSd&&effSd===null)currentStep="sd";
  else if(effSurg!==null&&(!needP1||effP1!==null)&&(!needP2||effP2!==null)&&(!needSd||effSd!==null)&&needSev&&effSev===null)currentStep="sev";
  else if(effSurg!==null)currentStep="done";

  // Completed selections summary
  const selections=[];
  if(effSurg!==null&&!sgInputSurg){const o=surgOpts.find(x=>x.surgVal===effSurg);if(o)selections.push({label:"手術",value:o.label,setter:needSurg?setSgSurgVal:null});}
  if(effP1!==null&&p1Opts){const o=p1Opts.find(x=>x.p1Val===effP1);if(o)selections.push({label:"処置等1",value:o.label,setter:needP1?setSgP1Val:null});}
  if(effP2!==null&&p2Opts){const o=p2Opts.find(x=>x.p2Val===effP2);if(o)selections.push({label:"処置等2",value:o.label,setter:needP2?setSgP2Val:null});}
  if(effSd!==null&&sdOpts){const o=sdOpts.find(x=>x.sdVal===effSd);if(o)selections.push({label:"副傷病",value:o.label,setter:needSd?setSgSdVal:null});}
  if(effSev!==null&&sevOpts){const o=sevOpts.find(x=>x.sevVal===effSev);if(o)selections.push({label:"重症度",value:o.label,setter:needSev?setSgSevVal:null});}

  const wsd=sgStayDays;
  const finalResults=currentStep==="done"?afterSev:[];
  const finalSorted=[...finalResults].sort((a,b)=>{
    if(wsd>0)return totalVal(b.days,b.points,wsd)-totalVal(a.days,a.points,wsd);
    return(b.points[0]||0)-(a.points[0]||0);
  });

  if(!sgSearched){
    return(
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:16,color:"#737373",fontWeight:500}}>条件を入力して検索</div>
          <div style={{fontSize:13,marginTop:6,color:"#A3A3A3"}}>手術や処置から最適なDPC・ICD-10をサジェスト</div>
        </div>
      </div>
    );
  }
  if(sgSearched&&sgExpanded.length===0){
    return(
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:14,color:"#737373"}}>一致するDPCがありません</div></div>
      </div>
    );
  }

  // Back button logic: find last completed selection with a setter
  const canGoBack=selections.some(s=>s.setter);
  const handleBack=()=>{
    setStepQuery("");
    for(let i=selections.length-1;i>=0;i--){
      if(selections[i].setter){selections[i].setter(null);break;}
    }
  };

  const stepTitles={surg:"実施した手術を選択してください",p1:"手術・処置等1を選択してください",p2:"手術・処置等2を選択してください",sd:"副傷病を選択してください",sev:"重症度を選択してください"};

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Toolbar: history + selections */}
      <div style={{padding:"10px 20px",borderBottom:"1px solid #E0E0E0",flexShrink:0,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowSgHist(v=>!v)} style={{padding:"5px 10px",background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:12,fontWeight:500,transition:"background .15s"}}>履歴</button>
          {showSgHist&&<HistoryPanel onClose={()=>setShowSgHist(false)} onRestoreSearch={h=>{onRestoreSearch(h);setShowSgHist(false);}} onJumpToCode={c=>{onJumpToCode(c);setShowSgHist(false);}} isMobile={isMobile}
            cmpSet={new Set(cmpList.map(x=>x.code))}
            onAddToCompare={code=>{
              const r=buildResultFromCode(code);if(!r)return;
              toggleCmp(r);
            }}/>}
        </div>
        {selections.map((s,i)=>(
          <span key={i} style={{background:"#F5F5F5",borderRadius:6,padding:"4px 10px",fontSize:12,display:"inline-flex",alignItems:"center",gap:4}}>
            <span style={{color:"#737373"}}>{s.label}:</span>
            <span style={{color:"#262626",fontWeight:600}}>{s.value}</span>
            {s.setter&&<button onClick={()=>s.setter(null)} aria-label={`${s.label}の選択を解除`} style={{background:"none",border:"none",color:"#A3A3A3",cursor:"pointer",padding:4,lineHeight:1,marginLeft:0,display:"inline-flex",alignItems:"center",verticalAlign:"middle"}}
              onMouseEnter={e=>e.currentTarget.style.color="#404040"} onMouseLeave={e=>e.currentTarget.style.color="#A3A3A3"}><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg></button>}
          </span>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"20px"}}>
        {currentStep!=="done"?(
          <div style={{maxWidth:640,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              {canGoBack&&(
                <button onClick={handleBack}
                  style={{padding:"6px 12px",background:"#F5F5F5",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:13,fontWeight:500,transition:"background .15s, color .15s",flexShrink:0}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#E5E5E5";e.currentTarget.style.color="#404040";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="#F5F5F5";e.currentTarget.style.color="#737373";}}>
                  ← 戻る
                </button>
              )}
              <div style={{fontSize:15,color:"#262626",fontWeight:700}}>{stepTitles[currentStep]}</div>
            </div>
            {(currentStep==="surg"||currentStep==="p1"||currentStep==="p2")&&(
              <div style={{marginBottom:8}}>
                <label htmlFor="step-search" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>手技コード・名称で検索</label>
                <input id="step-search" value={stepQuery} onChange={e=>{setStepQuery(e.target.value);}}
                  placeholder="手技コード・名称で検索..."
                  style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color .15s, box-shadow .15s"}}
                  onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}}
                  onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}}
                  onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} />
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(()=>{const hi=stepQuery.trim()?normalize(stepQuery.trim()):"";return(<>
              {currentStep==="surg"&&surgOpts.map(o=><SgOption key={o.surgVal} o={o} valueKey="surgVal" active={sgSurgVal===o.surgVal} onSelect={v=>{setSgSurgVal(v);setStepQuery("");}} highlight={hi}/>)}
              {currentStep==="p1"&&p1Opts.map(o=><SgOption key={o.p1Val} o={o} valueKey="p1Val" active={sgP1Val===o.p1Val} onSelect={v=>{setSgP1Val(v);setStepQuery("");}} highlight={hi}/>)}
              {currentStep==="p2"&&p2Opts.map(o=><SgOption key={o.p2Val} o={o} valueKey="p2Val" active={sgP2Val===o.p2Val} onSelect={v=>{setSgP2Val(v);setStepQuery("");}} highlight={hi}/>)}
              {currentStep==="sd"&&sdOpts.map(o=><SgOption key={o.sdVal} o={o} valueKey="sdVal" active={sgSdVal===o.sdVal} onSelect={setSgSdVal}/>)}
              {currentStep==="sev"&&sevOpts.map(o=><SgOption key={o.sevVal} o={o} valueKey="sevVal" active={sgSevVal===o.sevVal} onSelect={setSgSevVal}/>)}
              </>);})()}
            </div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {canGoBack&&(
                <button onClick={handleBack}
                  style={{padding:"6px 12px",background:"#F5F5F5",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:13,fontWeight:500,transition:"background .15s, color .15s",flexShrink:0}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#E5E5E5";e.currentTarget.style.color="#404040";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="#F5F5F5";e.currentTarget.style.color="#737373";}}>
                  ← 戻る
                </button>
              )}
              <div style={{fontSize:13,color:"#737373",fontWeight:600}}>{finalSorted.length}件のDPC候補{wsd>0?`（${wsd}日入院）`:""}</div>
            </div>
            {wsd<=0&&<div style={{fontSize:11,color:"#EF4444"}}>※入院日数を入力すると総点数で並び替え</div>}
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {finalSorted.map(r=>{
                const wTot=wsd>0?calcTotal(r.days,r.points,wsd):null;
                const chk=cmpList&&cmpList.find(x=>x.code===r.code);
                return(
                  <div key={r.code} style={{background:r.isDekidaka?"#FFF7ED":"#FFFFFF",borderRadius:8,border:chk?"2px solid #F59E0B":r.isDekidaka?"2px solid #FECACA":"2px solid #E0E0E0",padding:"9px 11px",transition:"border-color .15s, box-shadow .15s"}}
                    onMouseEnter={e=>{if(!chk)e.currentTarget.style.borderColor="#C0C0C0";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)";}}
                    onMouseLeave={e=>{if(!chk)e.currentTarget.style.borderColor=r.isDekidaka?"#FECACA":"#E0E0E0";e.currentTarget.style.boxShadow="none";}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <label style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,cursor:"pointer",flexShrink:0,margin:0}} title="比較に追加"><input type="checkbox" checked={!!chk} onChange={()=>toggleCmp(r)} aria-label={`${r.code}を比較に追加`} style={{cursor:"pointer",accentColor:"#F59E0B",width:16,height:16}} /></label>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <button onClick={()=>onDetail(r)} style={{fontFamily:M,color:r.isDekidaka?"#E11D48":"#3B82F6",fontWeight:700,fontSize:15,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(59,130,246,.3)",textUnderlineOffset:2,background:"none",border:"none",padding:0}}>{r.code}</button>
                          {r.isDekidaka&&<span style={{background:"#EF4444",color:"#fff",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>出来高</span>}
                          <span style={{color:"#737373",fontSize:13}}>{r.clsName}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        {wsd>0&&!r.isDekidaka&&wTot&&(
                          <div style={{textAlign:"right",marginRight:6}}>
                            <div style={{fontSize:10,color:wTot.overDays>0?"#EF4444":"#737373"}}>{wTot.overDays>0?`DPC${wTot.d3}日+出来高${wTot.overDays}日`:`総点数（${wsd}日）`}</div>
                            <div style={{fontFamily:M,fontWeight:700,color:"#F59E0B",fontSize:16}}>{wTot.total.toLocaleString()}</div>
                            {wTot.overDays>0&&<div style={{fontSize:9,color:"#C0392B"}}>※DPC包括分のみ</div>}
                          </div>
                        )}
                        {r.isDekidaka?(
                          <div style={{color:"#EF4444",fontSize:13,fontWeight:600,minWidth:60,textAlign:"center"}}>出来高</div>
                        ):(
                          <div style={{display:"flex",gap:isMobile?2:4}}>
                            {r.points.map((p,pi)=>(
                              <div key={pi} style={{textAlign:"center",minWidth:isMobile?40:48,background:pi===0?"rgba(59,130,246,.06)":"transparent",borderRadius:5,padding:"3px 4px"}}>
                                <div style={{fontSize:isMobile?9:10,color:"#737373"}}>{["Ⅰ","Ⅱ","Ⅲ"][pi]}</div>
                                <div style={{fontFamily:M,fontWeight:pi===0?700:400,color:pi===0?"#3B82F6":"#737373",fontSize:pi===0?(isMobile?14:16):(isMobile?11:13)}}>{p?p.toLocaleString():"-"}</div>
                                <div style={{fontSize:isMobile?8:9,color:"#8B8B8B"}}>{r.days[pi]||"-"}日</div>
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
            {(()=>{const icds=getIcdCandidates(finalSorted);return icds.length>0?(
              <div style={{marginTop:8}}>
                <div style={{fontSize:12,color:"#262626",fontWeight:700,marginBottom:6}}>対象ICD-10候補</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {icds.slice(0,50).map(ic=>(
                    <span key={ic.code} style={{background:"#FAFAFA",border:"1px solid #E0E0E0",borderRadius:4,padding:"3px 8px",fontSize:12}}>
                      <span style={{fontFamily:M,color:"#3B82F6",fontWeight:600}}>{ic.code}</span>
                      {ic.name&&<span style={{color:"#737373",marginLeft:4}}>{ic.name}</span>}
                    </span>
                  ))}
                  {icds.length>50&&<span style={{fontSize:11,color:"#737373",padding:"3px 8px"}}>他{icds.length-50}件</span>}
                </div>
              </div>
            ):null;})()}
          </div>
        )}
      </div>
    </div>
  );
}

const mkSgTab=()=>({expanded:[],stayDays:0,searched:false,surgVal:null,p1Val:null,p2Val:null,sdVal:null,sevVal:null,inputSurg:""});

export default function DPCTool(){
  const isMobile=useIsMobile();
  const[mobileView,setMobileView]=useState("search");
  const[mode,setMode]=useState("list");
  // Suggest mode state — 2 independent tabs
  const[sgTabIdx,setSgTabIdx]=useState(0);
  const[sgTabs,setSgTabs]=useState([mkSgTab(),mkSgTab()]);
  const sg=sgTabs[sgTabIdx];
  const setSg=fn=>setSgTabs(prev=>{const next=[...prev];next[sgTabIdx]=typeof fn==="function"?fn(next[sgTabIdx]):{...next[sgTabIdx],...fn};return next;});
  const mkSgSearchCb=i=>(exp,sd,inputSurg)=>{setSgTabs(prev=>{const next=[...prev];next[i]={expanded:exp,stayDays:sd,searched:true,surgVal:null,p1Val:null,p2Val:null,sdVal:null,sevVal:null,inputSurg:inputSurg||""};return next;});};
  const mkSgResetCb=i=>()=>{setSgTabs(prev=>{const next=[...prev];next[i]=mkSgTab();return next;});};
  const sgSearchCb0=useCallback(mkSgSearchCb(0),[]);const sgSearchCb1=useCallback(mkSgSearchCb(1),[]);
  const sgResetCb0=useCallback(mkSgResetCb(0),[]);const sgResetCb1=useCallback(mkSgResetCb(1),[]);
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
  const[lastParams,setLastParams]=useState(null);
  const[drillP1,setDrillP1]=useState(null);const[drillP2,setDrillP2]=useState(null);
  const[mdcFilter,setMdcFilter]=useState("");
  const[showHistory,setShowHistory]=useState(false);
  const[favSet,setFavSet]=useState(()=>new Set(getFavorites().map(f=>f.code)));
  const[showFb,setShowFb]=useState(false);const[fbText,setFbText]=useState("");const[fbSent,setFbSent]=useState(false);

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
    setResults(r);setSearched(true);setLastParams(p);
    setExpandedDPCs(getExpandedResults(r,p));
    setDrillP1(null);setDrillP2(null);
    if(isMobile)setMobileView("results");
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
    setExpandedDPCs([]);setLastParams(null);setDrillP1(null);setDrillP2(null);setMdcFilter("");
  };
  const[cmpErr,setCmpErr]=useState("");
  const toggleCmp=r=>{setCmpList(p=>{if(p.find(x=>x.code===r.code)){setCmpErr("");return p.filter(x=>x.code!==r.code);}if(p.length>=4){setCmpErr("比較は最大4つまでです。追加するには既存の項目を外してください。");setTimeout(()=>setCmpErr(""),5000);return p;}setCmpErr("");return[...p,r];});};
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
      const r=searchDPC(p);setResults(r);setSearched(true);setLastParams(p);
      setExpandedDPCs(getExpandedResults(r,p));setDrillP1(null);setDrillP2(null);
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
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E0E0E0",padding:isMobile?"6px 12px":"10px 20px",display:"flex",alignItems:"center",gap:isMobile?8:12,flexShrink:0}}>
        <div style={{width:isMobile?26:32,height:isMobile?26:32,borderRadius:isMobile?5:7,background:"#262626",display:"flex",alignItems:"center",justifyContent:"center",fontSize:isMobile?13:16,fontWeight:800,color:"#fff"}}>D</div>
        <div style={{flex:1}}>
          <div style={{fontSize:isMobile?13:16,fontWeight:800,color:"#262626"}}>DPC検索ツール</div>
          {!isMobile&&<div style={{fontSize:10,color:"#737373"}}>令和8年度 DPC電子点数表 ─ {Object.keys(D.dpc).length.toLocaleString()} DPC ・ {Object.keys(D.icn).length.toLocaleString()} ICD-10 ・ 出来高算定手術{Object.keys(D.dk).length}件</div>}
        </div>
        <button onClick={()=>{setShowFb(true);setFbSent(false);setFbText("");}} style={{padding:isMobile?"6px 10px":"7px 14px",background:"#F5F5F5",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:500,display:"flex",alignItems:"center",gap:5,flexShrink:0,transition:"background .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="#EBEBEB";}} onMouseLeave={e=>{e.currentTarget.style.background="#F5F5F5";}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {isMobile?"要望":"ご意見・要望"}
        </button>
      </div>

      {/* Mobile Tab Bar */}
      {isMobile&&(
        <div style={{display:"flex",borderBottom:"1px solid #E0E0E0",background:"#FFFFFF",flexShrink:0}}>
          {[["search","検索"],["results","結果"]].map(([k,v])=>(
            <button key={k} onClick={()=>setMobileView(k)}
              style={{flex:1,padding:"8px 0",border:"none",borderBottom:mobileView===k?"2px solid #262626":"2px solid transparent",
                background:mobileView===k?"#FFFFFF":"#F5F5F5",color:mobileView===k?"#262626":"#737373",
                fontWeight:mobileView===k?700:500,fontSize:13,cursor:"pointer",transition:"all .15s"}}>
              {v}{k==="results"&&searched?` (${displayedResults.length})`:""}</button>
          ))}
        </div>
      )}

      {/* Main Content - 2 Column Layout (desktop) / Tab switch (mobile) */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Left Column: Search Zone */}
        <aside style={{width:isMobile?"100%":320,flexShrink:0,background:"#FFFFFF",borderRight:isMobile?"none":"1px solid #E0E0E0",overflow:"auto",display:isMobile?(mobileView==="search"?"flex":"none"):"flex",flexDirection:"column"}}>
          {/* Mode tabs */}
          <div role="tablist" style={{display:"flex",borderBottom:"1px solid #E0E0E0",flexShrink:0}}>
            {[["list","一覧検索"],["suggest","最適DPCサジェスト"]].map(([k,v])=>(
              <button key={k} role="tab" aria-selected={mode===k} id={`tab-${k}`} aria-controls={`panel-${k}`}
                onClick={()=>setMode(k)}
                style={{flex:1,padding:"10px 8px",border:"none",borderBottom:mode===k?"2px solid #262626":"2px solid transparent",
                  background:mode===k?"#FFFFFF":"#F5F5F5",color:mode===k?"#262626":"#737373",
                  fontWeight:mode===k?700:500,fontSize:12,cursor:"pointer",transition:"all .15s"}}>
                {v}
              </button>
            ))}
          </div>

          {mode==="list"?(
            <div role="tabpanel" id="panel-list" aria-labelledby="tab-list" onKeyDown={e=>{if(e.key==="Enter"&&e.target.tagName!=="SELECT"){e.preventDefault();doSearch();}}} style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12,flex:1}}>
              <AC label="ICD-10（病名）" value={icdIn} onChange={v=>{setIcdIn(v);setSelIcd("");}} onSelect={r=>{setIcdIn(`${r.code} ${r.name}`);setSelIcd(r.code);}} searchFn={searchDisease} placeholder="例: 肺炎, I510..." isMobile={isMobile} />
              <AC label="手術（Kコード）" value={surgIn} onChange={v=>{setSurgIn(v);setSelSurg("");}} onSelect={r=>{setSurgIn(`${r.code} ${r.name}`);setSelSurg(r.code);}} searchFn={searchSurg} placeholder="例: K549..." isMobile={isMobile} />
              <AC label="手術・処置等" value={procIn} onChange={v=>{setProcIn(v);setSelProc("");}} onSelect={r=>{setProcIn(`${r.code} ${r.name}`);setSelProc(r.code);}} searchFn={searchProc} placeholder="例: SPECT, E101..." showTag isMobile={isMobile} />
              <AC label="薬剤検索" value={drugIn} onChange={v=>{setDrugIn(v);setSelDrug("");}} onSelect={r=>{setDrugIn(`${r.code} ${r.name}`);setSelDrug(r.code);}} searchFn={searchDrug} placeholder="例: リコモジュリン..." isMobile={isMobile} />

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div>
                  <label htmlFor="list-stay-days" style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>入院日数</label>
                  <input id="list-stay-days" type="number" min="1" max="365" value={stayDays} onChange={e=>setStayDays(e.target.value)} placeholder="14"
                    style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:14,outline:"none",transition:"border-color .15s, box-shadow .15s"}}
                    onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}} />
                </div>
                <div>
                  <label htmlFor="list-sort-mode" style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>並び替え</label>
                  <select id="list-sort-mode" value={sortMode} onChange={e=>setSortMode(e.target.value)}
                    style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",cursor:"pointer",transition:"border-color .15s, box-shadow .15s"}}
                    onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}}>
                    <option value="total">総点数順</option>
                    <option value="period">DPC期間が長い順</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="list-mdc-filter" style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>MDC</label>
                  <select id="list-mdc-filter" value={mdcFilter} onChange={e=>setMdcFilter(e.target.value)}
                    style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",cursor:"pointer",transition:"border-color .15s, box-shadow .15s"}}
                    onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}}>
                    <option value="">全て</option>
                    {Object.entries(MDC_NAMES).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=><option key={k} value={k}>{k}: {v}</option>)}
                  </select>
                </div>
              </div>

              {dekidakaWarn&&<div role="alert" style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:6,padding:"8px 12px",fontSize:13,color:"#EF4444"}}>{dekidakaWarn}</div>}

              {sortMode==="total"&&!sd&&searched&&displayedResults.length>0&&<div style={{fontSize:11,color:"#EF4444"}}>※入院日数を入力すると総点数でソート</div>}

              <div style={{display:"flex",gap:8}}>
                <button onClick={doReset} style={{flex:1,padding:"10px 14px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:13,fontWeight:500,transition:"background .15s"}}>クリア</button>
                <button onClick={doSearch} style={{flex:1,padding:"10px 22px",background:"#262626",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,transition:"background .15s"}}>検索</button>
              </div>
            </div>
          ):(
            <div role="tabpanel" id="panel-suggest" aria-labelledby="tab-suggest" style={{display:"flex",flexDirection:"column",flex:1}}>
              <div style={{display:"flex",borderBottom:"1px solid #E0E0E0",flexShrink:0}}>
                {[0,1].map(i=>(
                  <button key={i} onClick={()=>setSgTabIdx(i)}
                    style={{flex:1,padding:"6px 0",border:"none",borderBottom:sgTabIdx===i?"2px solid #6366F1":"2px solid transparent",
                      background:sgTabIdx===i?"#FFFFFF":"#F5F5F5",color:sgTabIdx===i?"#6366F1":"#A3A3A3",
                      fontWeight:sgTabIdx===i?700:500,fontSize:11,cursor:"pointer",transition:"all .15s"}}>
                    検索{i+1}{sgTabs[i].searched?" ●":""}
                  </button>
                ))}
              </div>
              <div style={{padding:"16px 20px",flex:1,display:sgTabIdx===0?"block":"none",overflow:"auto"}}>
                <SuggestWizard onSearch={sgSearchCb0} onReset={sgResetCb0} />
              </div>
              <div style={{padding:"16px 20px",flex:1,display:sgTabIdx===1?"block":"none",overflow:"auto"}}>
                <SuggestWizard onSearch={sgSearchCb1} onReset={sgResetCb1} />
              </div>
            </div>
          )}
        </aside>

        {/* Right Column: Results Zone */}
        <main id="main-content" style={{flex:1,display:isMobile?(mobileView==="results"?"flex":"none"):"flex",flexDirection:"column",overflow:"hidden"}}>
         {mode==="list"?(<>
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
                {showHistory&&<HistoryPanel onClose={()=>setShowHistory(false)} onRestoreSearch={restoreSearch} onJumpToCode={jumpToCode} isMobile={isMobile}
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
                    <div key={r.code} style={{background:r.isDekidaka?"#FFF7ED":"#FFFFFF",borderRadius:8,border:chk?"2px solid #F59E0B":r.isDekidaka?"2px solid #FECACA":"2px solid #E0E0E0",padding:"9px 11px",transition:"border-color .15s, box-shadow .15s"}}
                      onMouseEnter={e=>{if(!chk)e.currentTarget.style.borderColor="#C0C0C0";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.04)";}}
                      onMouseLeave={e=>{if(!chk)e.currentTarget.style.borderColor=r.isDekidaka?"#FECACA":"#E0E0E0";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={e=>{e.stopPropagation();toggleFav(r);}} aria-label={favSet.has(r.code)?"お気に入りから削除":"お気に入りに追加"} style={{cursor:"pointer",flexShrink:0,background:"none",border:"none",padding:6,display:"flex",alignItems:"center",justifyContent:"center"}} title="お気に入り"><svg width="18" height="18" viewBox="0 0 24 24" fill={favSet.has(r.code)?"#F59E0B":"none"} stroke={favSet.has(r.code)?"#F59E0B":"#A3A3A3"} strokeWidth="2"><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/></svg></button>
                        <label style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,cursor:"pointer",flexShrink:0,margin:0}} title="比較に追加"><input type="checkbox" checked={chk} onChange={()=>toggleCmp(r)} aria-label={`${r.code}を比較に追加`} style={{cursor:"pointer",accentColor:"#F59E0B",width:16,height:16}} /></label>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <button onClick={()=>setDetail(r)} style={{fontFamily:M,color:r.isDekidaka?"#E11D48":"#3B82F6",fontWeight:700,fontSize:15,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(59,130,246,.3)",textUnderlineOffset:2,background:"none",border:"none",padding:0}}>{r.code}</button>
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
                              {tot.overDays>0&&<div style={{fontSize:9,color:"#C0392B"}}>※DPC包括分のみ</div>}
                            </div>
                          )}
                          {r.isDekidaka?(
                            <div style={{color:"#EF4444",fontSize:13,fontWeight:600,minWidth:isMobile?40:60,textAlign:"center"}}>出来高</div>
                          ):(
                            <div style={{display:"flex",gap:isMobile?2:4}}>
                              {r.points.map((p,pi)=>(
                                <div key={pi} style={{textAlign:"center",minWidth:isMobile?40:48,background:pi===0?"rgba(59,130,246,.06)":"transparent",borderRadius:5,padding:"3px 4px"}}>
                                  <div style={{fontSize:isMobile?9:10,color:"#737373"}}>{["Ⅰ","Ⅱ","Ⅲ"][pi]}</div>
                                  <div style={{fontFamily:M,fontWeight:pi===0?700:400,color:pi===0?"#3B82F6":"#737373",fontSize:pi===0?(isMobile?14:16):(isMobile?11:13)}}>{p?p.toLocaleString():"-"}</div>
                                  <div style={{fontSize:isMobile?8:9,color:"#8B8B8B"}}>{r.days[pi]||"-"}日</div>
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,color:"#737373",fontWeight:500}}>検索条件を入力してください</div>
                  <div style={{fontSize:13,marginTop:6,color:"#A3A3A3"}}>疾患名・手術・処置・薬剤のいずれかで検索</div>
                </div>
              </div>
            ):searched?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",overflow:"auto",height:"100%",padding:"20px"}}>
                <div style={{textAlign:"center",maxWidth:560,width:"100%"}}>
                  <div style={{fontSize:14,color:"#737373",fontWeight:600}}>{mdcFilter?`MDC ${mdcFilter} に該当するDPCがありません`:"一致するDPCがありません"}</div>
                  {(()=>{
                    if(mdcFilter||!lastParams)return null;
                    const hints=getNoResultHints(lastParams);
                    if(!hints||!hints.evalItems.length)return null;
                    const grouped={};
                    for(const it of hints.evalItems){const k=`${it.cls}_${it.branch}`;if(!grouped[k])grouped[k]={cls:it.cls,clsName:it.clsName,branch:it.branch,surgs:[]};grouped[k].surgs.push(it);}
                    return(
                      <div style={{marginTop:16,textAlign:"left",background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:8,padding:"14px 18px"}}>
                        <div style={{fontSize:13,color:"#404040",fontWeight:600,marginBottom:10}}>
                          <span style={{fontFamily:M,color:"#3B82F6"}}>{hints.code}</span>
                          {hints.name&&<span style={{color:"#737373",fontWeight:400}}> ({hints.name})</span>}
                          <span> が評価される条件：</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {Object.values(grouped).map((g,i)=>(
                            <div key={i} style={{background:"#FAFAFA",borderRadius:6,padding:"10px 12px",border:"1px solid #F0F0F0"}}>
                              <div style={{fontSize:12,fontWeight:600,color:"#404040",marginBottom:4}}>
                                <span style={{fontFamily:M,color:"#3B82F6"}}>{g.cls}</span>
                                <span style={{marginLeft:6}}>{g.clsName}</span>
                                <span style={{marginLeft:8,fontSize:11,color:"#10B981",fontWeight:500}}>({g.branch})</span>
                              </div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                {g.surgs.map((s,j)=>(
                                  <span key={j} style={{background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:4,padding:"3px 8px",fontSize:12,color:"#404040"}}>
                                    {s.surgName||`手術区分${s.surgVal}`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        {lastParams.surgeryCode&&<div style={{marginTop:10,fontSize:12,color:"#737373"}}>入力した手術（<span style={{fontFamily:M,color:"#3B82F6"}}>{lastParams.surgeryCode}</span>）とは異なる手術区分で評価されるため、組み合わせでは該当がありません。</div>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ):null}
          </div>
         </>):(<SuggestRightPanel
            sgExpanded={sg.expanded} sgStayDays={sg.stayDays} sgSearched={sg.searched}
            sgSurgVal={sg.surgVal} setSgSurgVal={v=>setSg(t=>({...t,surgVal:v,p1Val:null,p2Val:null,sdVal:null,sevVal:null}))}
            sgP1Val={sg.p1Val} setSgP1Val={v=>setSg(t=>({...t,p1Val:v,p2Val:null,sdVal:null,sevVal:null}))}
            sgP2Val={sg.p2Val} setSgP2Val={v=>setSg(t=>({...t,p2Val:v,sdVal:null,sevVal:null}))}
            sgSdVal={sg.sdVal} setSgSdVal={v=>setSg(t=>({...t,sdVal:v,sevVal:null}))}
            sgSevVal={sg.sevVal} setSgSevVal={v=>setSg(t=>({...t,sevVal:v}))}
            sgInputSurg={sg.inputSurg}
            onDetail={setDetail}
            cmpList={cmpList} toggleCmp={toggleCmp}
            isMobile={isMobile}
            onRestoreSearch={h=>{restoreSearch(h);setMode("list");}}
            onJumpToCode={jumpToCode}
          />
         )}
        </main>
      </div>

      {/* Compare Zone - Bottom */}
      {cmpList.length>0&&(
        <div style={{background:"#FFFFFF",borderTop:"1px solid #E0E0E0",padding:isMobile?"8px 12px":"12px 20px",flexShrink:0}}>
          {cmpErr&&<div role="alert" style={{background:"rgba(192,57,43,.08)",border:"1px solid rgba(192,57,43,.2)",borderRadius:6,padding:"6px 12px",marginBottom:8,color:"#C0392B",fontSize:12,fontWeight:500}}>{cmpErr}</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:13,color:"#262626",fontWeight:600}}>比較ゾーン（{cmpList.length}/4）</span>
            <div style={{display:"flex",gap:8}}>
              {cmpList.length>=2&&<button onClick={()=>setShowCmp(true)} style={{padding:"6px 16px",background:"#262626",border:"none",borderRadius:6,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,flexShrink:0}}>比較</button>}
              <button onClick={()=>setCmpList([])} style={{padding:"6px 12px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:12,flexShrink:0}}>クリア</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2, 1fr)":"repeat(4, 1fr)",gap:isMobile?6:10}}>
            {[0,1,2,3].map(i=>{
              const r=cmpList[i];
              return r?(
                <div key={r.code} style={{background:"#FAFAFA",border:"1px solid #E0E0E0",borderRadius:8,padding:"10px 12px",position:"relative"}}>
                  <div style={{fontFamily:M,color:r.isDekidaka?"#E11D48":"#3B82F6",fontWeight:700,fontSize:13}}>{r.code}</div>
                  <div style={{fontSize:11,color:"#737373",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.clsName}</div>
                  <button onClick={()=>toggleCmp(r)} aria-label={`${r.code}を比較から削除`} style={{position:"absolute",top:2,right:2,background:"none",border:"none",color:"#737373",cursor:"pointer",padding:8,fontSize:14,lineHeight:1,transition:"color .15s",display:"flex",alignItems:"center",justifyContent:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#404040"} onMouseLeave={e=>e.currentTarget.style.color="#737373"}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg></button>
                </div>
              ):(
                <div key={i} style={{border:"2px dashed #E0E0E0",borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:52}}>
                  <span style={{color:"#8B8B8B",fontSize:12}}>結果から選択</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCmp&&<CompareModal items={cmpList} onClose={()=>setShowCmp(false)} sd={mode==="suggest"?sg.stayDays:sd} isMobile={isMobile}/>}
      {detail&&<Detail r={detail} onClose={()=>setDetail(null)} sd={mode==="suggest"?sg.stayDays:sd} isMobile={isMobile} onSearchCls={targetCls=>{
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
      {showIcd&&<IcdPanel results={results} onClose={()=>setShowIcd(false)} isMobile={isMobile}/>}
      {showFb&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowFb(false);}}>
          <div style={{background:"#FFFFFF",borderRadius:12,padding:"24px 28px",width:"100%",maxWidth:440,boxShadow:"0 16px 48px rgba(0,0,0,.15)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700,color:"#262626"}}>ご意見・改善要望</div>
              <button onClick={()=>setShowFb(false)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#737373",display:"flex"}} aria-label="閉じる">
                <svg width="18" height="18" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
              </button>
            </div>
            {fbSent?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:28,marginBottom:8}}>&#10003;</div>
                <div style={{fontSize:14,color:"#404040",fontWeight:600}}>送信しました</div>
                <div style={{fontSize:12,color:"#737373",marginTop:4}}>貴重なご意見ありがとうございます</div>
                <button onClick={()=>setShowFb(false)} style={{marginTop:16,padding:"8px 24px",background:"#262626",border:"none",borderRadius:6,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13}}>閉じる</button>
              </div>
            ):(
              <>
                <div style={{fontSize:12,color:"#737373",marginBottom:8}}>不具合の報告や機能の改善要望をお寄せください。いただいた内容は今後の改善に活用いたします。</div>
                <textarea value={fbText} onChange={e=>setFbText(e.target.value)} placeholder="例：〇〇を検索したときに△△が表示されない、□□の機能がほしい、など" rows={5}
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FAFAFA",color:"#404040",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color .15s"}}
                  onFocus={e=>{e.target.style.borderColor="#404040";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";}} />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
                  {(()=>{const cnt=getFeedbacks().length;return cnt>0?(
                    <button onClick={exportFeedbacksJSON} style={{padding:"6px 12px",background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:6,color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:4,transition:"background .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background="#F5F5F5";}} onMouseLeave={e=>{e.currentTarget.style.background="#FFFFFF";}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      エクスポート（{cnt}件）
                    </button>
                  ):<div/>;})()}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setShowFb(false)} style={{padding:"8px 16px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:6,color:"#737373",cursor:"pointer",fontSize:13,fontWeight:500}}>キャンセル</button>
                    <button onClick={()=>{if(!fbText.trim())return;addFeedback(fbText.trim());setFbSent(true);}} disabled={!fbText.trim()}
                      style={{padding:"8px 20px",background:fbText.trim()?"#262626":"#C0C0C0",border:"none",borderRadius:6,color:"#fff",fontWeight:700,cursor:fbText.trim()?"pointer":"not-allowed",fontSize:13,transition:"background .15s"}}>
                      送信
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
