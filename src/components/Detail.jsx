import { useState } from "react";
import { D } from "../data";
import { M } from "../styles";
import { calcTotal, cleanName, getSubdiagICDs } from "../utils";
import SimChart from "./SimChart";
import SimilarCls from "./SimilarCls";

export default function Detail({r,onClose,sd,onSearchCls}){
  const[showChart,setShowChart]=useState(false);
  if(!r)return null;
  const cls=r.cls;const icds=D.icd[cls]||[];const si=D.si[cls]||{};const p1e=D.p1[cls]||{};const p2e=D.p2[cls]||{};
  const tot=calcTotal(r.days,r.points,sd);const svDef=D.sv?.[cls];
  const validSv=new Set();for(const info of Object.values(D.dpc)){if(info[0]+info[1]===cls)validSv.add(info[3]);}
  const Row=({l,v,c})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1e293b"}}><span style={{color:"#64748b",fontSize:14}}>{l}</span><span style={{color:c||"#e2e8f0",fontSize:14,fontWeight:500,textAlign:"right",maxWidth:"60%"}}>{v}</span></div>);
  const Sec=({title,children})=>{const[o,setO]=useState(false);return(<div style={{marginTop:8}}><button onClick={()=>setO(!o)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,fontWeight:600,padding:0}}><span style={{transform:o?"rotate(90deg)":"none",transition:"transform .15s",display:"inline-block"}}>▸</span>{title}</button>{o&&<div style={{marginTop:6,background:"#0a0f1a",borderRadius:6,padding:8,maxHeight:180,overflow:"auto"}}>{children}</div>}</div>);};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#111827",borderRadius:12,border:"1px solid #1e293b",maxWidth:"90vw",width:520,maxHeight:"85vh",overflow:"auto",padding:0}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1e293b",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{color:"#38bdf8",fontFamily:M,fontSize:20,fontWeight:700}}>{r.code}</span>
              {r.isDekidaka&&<span style={{background:"#ef4444",color:"#fff",borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:700}}>出来高</span>}
            </div>
            <div style={{color:"#94a3b8",fontSize:14}}>{r.clsName}</div>
            {r.condLabel&&<div style={{color:"#fbbf24",fontSize:13,marginTop:2}}>{r.condLabel}</div>}
          </div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",color:"#94a3b8",cursor:"pointer",width:32,height:32,borderRadius:6,fontSize:14,flexShrink:0}}>✕</button>
        </div>
        {!r.isDekidaka?(
          <div style={{padding:"16px 20px",borderBottom:"1px solid #1e293b"}}>
            <div style={{display:"flex",gap:0}}>
              {["Ⅰ","Ⅱ","Ⅲ"].map((l,i)=>(
                <div key={i} style={{flex:1,textAlign:"center",padding:"10px 0",background:i===0?"rgba(56,189,248,.06)":"transparent",borderRadius:i===0?8:0}}>
                  <div style={{color:"#64748b",fontSize:12}}>期間{l}（{r.days[i]||"-"}日）</div>
                  <div style={{fontFamily:M,fontWeight:700,color:i===0?"#38bdf8":"#94a3b8",fontSize:i===0?26:18}}>{r.points[i]?.toLocaleString()||"-"}</div>
                  <div style={{color:"#475569",fontSize:11}}>点/日</div>
                </div>
              ))}
            </div>
            {tot&&(<div style={{background:"#0f172a",borderRadius:8,padding:12,textAlign:"center",marginTop:10}}>
              <div style={{color:"#64748b",fontSize:12}}>{sd}日入院の総点数{tot.overDays>0?<span style={{color:"#ef4444"}}> （うち{tot.overDays}日は出来高）</span>:""}</div>
              <div style={{fontFamily:M,fontWeight:800,color:"#f59e0b",fontSize:28}}>{tot.total.toLocaleString()}<span style={{fontSize:13,color:"#64748b",fontWeight:400}}>点</span></div>
            </div>)}
            <button onClick={()=>setShowChart(true)} style={{width:"100%",marginTop:8,padding:"8px 0",background:"#1e293b",border:"1px solid #334155",borderRadius:6,color:"#38bdf8",cursor:"pointer",fontSize:13,fontWeight:600}}>点数推移グラフ</button>
          </div>
        ):(
          <div style={{padding:"16px 20px",borderBottom:"1px solid #1e293b"}}>
            <div style={{background:"rgba(239,68,68,.08)",borderRadius:8,padding:14,textAlign:"center"}}>
              <div style={{color:"#ef4444",fontSize:16,fontWeight:700}}>出来高算定</div>
              <div style={{color:"#94a3b8",fontSize:13,marginTop:2}}>DPC包括対象外</div>
            </div>
          </div>
        )}
        <div style={{padding:"12px 20px"}}>
          <Row l="手術" v={r.surgeryName||"なし"} />
          <Row l="手術・処置等１" v={r.proc1Name} />
          <Row l="手術・処置等２" v={r.proc2Name} />
          <Row l="定義副傷病" v={r.subdiagName} />
          {r.subdiagName&&r.subdiagName!=="なし"&&r.subdiagName!=="-"&&(()=>{
            const sdICDs=getSubdiagICDs(r.cls,r.sdVal);
            return sdICDs.length>0?(
              <div style={{background:"#0a0f1a",borderRadius:6,padding:8,marginBottom:4,maxHeight:120,overflowY:"auto"}}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>副傷病 対象ICD（{sdICDs.length}件）</div>
                {sdICDs.map((ic,i)=>(
                  <div key={i} style={{fontSize:12,color:"#94a3b8",padding:"1px 0",display:"flex",gap:6}}>
                    <span style={{color:"#f97316",fontFamily:M,flexShrink:0,minWidth:48,fontSize:11}}>{ic.code}{ic.isPrefix?"~":""}</span>
                    <span>{ic.name||""}</span>
                  </div>
                ))}
              </div>
            ):null;
          })()}
          {r.severity&&<Row l={`重症度等（${r.severity.name}）`} v={r.severity.label} c="#fbbf24" />}
          {r.condLabel&&<Row l="病態等分類" v={r.condLabel} c="#fbbf24" />}
        </div>
        {svDef&&Object.keys(svDef).filter(k=>k!=="name").length>1&&(
          <div style={{padding:"0 20px 12px"}}>
            <div style={{color:"#94a3b8",fontSize:12,fontWeight:600,marginBottom:6}}>重症度分岐 ─ {svDef.name}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {Object.entries(svDef).filter(([k])=>k!=="name").sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([v,lb])=>{
                const cur=r.severity?.value===v;
                return(<div key={v} style={{background:cur?"rgba(251,191,36,.1)":"#0a0f1a",border:cur?"1px solid #fbbf24":"1px solid #1e293b",borderRadius:4,padding:"4px 8px",fontSize:12}}>
                  <span style={{fontFamily:M,color:cur?"#fbbf24":"#38bdf8",fontWeight:cur?700:400,fontSize:11}}>[{v}]</span>{" "}
                  <span style={{color:cur?"#fbbf24":"#94a3b8"}}>{lb}</span>
                </div>);
              })}
            </div>
          </div>
        )}
        <div style={{padding:"0 20px 16px"}}>
          <Sec title={`対象ICD-10（${icds.length}件）`}>
            {icds.slice(0,100).map((c,i)=>(<div key={i} style={{fontSize:12,color:"#94a3b8",padding:"2px 0",display:"flex",gap:6}}><span style={{color:"#38bdf8",fontFamily:M,flexShrink:0,minWidth:48,fontSize:11}}>{c}</span><span>{cleanName(D.icn[c]||"")}</span></div>))}
            {icds.length>100&&<div style={{color:"#475569",fontSize:11,marginTop:2}}>他{icds.length-100}件</div>}
          </Sec>
          <Sec title={`手術定義（${Object.entries(si).filter(([c])=>validSv.has(c)).length}区分）`}>
            {Object.entries(si).filter(([c])=>validSv.has(c)).sort((a,b)=>{if(a[0]==="99")return 1;if(b[0]==="99")return-1;if(a[0]==="97")return 1;if(b[0]==="97")return-1;return a[0].localeCompare(b[0]);}).map(([corr,idx],i)=>(
              <div key={i} style={{color:"#cbd5e1",marginBottom:3,fontSize:12}}>
                <span style={{fontFamily:M,color:corr===r.surgVal?"#f59e0b":"#38bdf8",fontWeight:corr===r.surgVal?700:400,fontSize:11}}>[{corr}]</span>{" "}
                {D.sl[idx]?.slice(0,3).map(k=>`${k}(${(D.cn[k]||"").slice(0,15)})`).join(", ")}
              </div>
            ))}
          </Sec>
          {r.hasP1Branch&&Object.keys(p1e).length>0&&(
            <Sec title={`処置等１定義（${Object.keys(p1e).length}区分）`}>
              {Object.entries(p1e).sort((a,b)=>parseInt(b[0]||0)-parseInt(a[0]||0)).map(([corr,codes],i)=>(<div key={i} style={{color:"#cbd5e1",marginBottom:3,fontSize:12}}><span style={{fontFamily:M,color:corr===r.p1Val?"#f59e0b":"#38bdf8",fontWeight:corr===r.p1Val?700:400,fontSize:11}}>[{corr}]</span>{" "}{codes.slice(0,3).map(c=>`${c}(${(D.cn[c]||"").slice(0,15)})`).join(", ")}</div>))}
            </Sec>
          )}
          {r.hasP2Branch&&Object.keys(p2e).length>0&&(
            <Sec title={`処置等２定義（${Object.keys(p2e).length}区分）`}>
              {Object.entries(p2e).sort((a,b)=>parseInt(b[0]||0)-parseInt(a[0]||0)).map(([corr,codes],i)=>(<div key={i} style={{color:"#cbd5e1",marginBottom:3,fontSize:12}}><span style={{fontFamily:M,color:corr===r.p2Val?"#f59e0b":"#38bdf8",fontWeight:corr===r.p2Val?700:400,fontSize:11}}>[{corr}]</span>{" "}{codes.slice(0,3).map(c=>{const n=D.cn[c]||"";const a=D.da?.[c];const d=a?.length?`${n}(${a[0]})`:n;return`${c}(${d.slice(0,20)})`;}).join(", ")}</div>))}
            </Sec>
          )}
          <SimilarCls cls={cls} onSearch={onSearchCls}/>
        </div>
      </div>
      {showChart&&<SimChart r={r} sd={sd} onClose={()=>setShowChart(false)}/>}
    </div>
  );
}
