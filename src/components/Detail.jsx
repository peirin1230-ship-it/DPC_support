import { useState } from "react";
import { D } from "../data";
import { M } from "../styles";
import { calcTotal, cleanName, getSubdiagICDs } from "../utils";
import useModal from "../useModal";
import SimChart from "./SimChart";
import SimilarCls from "./SimilarCls";

export default function Detail({r,onClose,sd,onSearchCls}){
  const[showChart,setShowChart]=useState(false);
  const modalRef=useModal(onClose);
  if(!r)return null;
  const cls=r.cls;const icds=D.icd[cls]||[];const si=D.si[cls]||{};const p1e=D.p1[cls]||{};const p2e=D.p2[cls]||{};
  const tot=calcTotal(r.days,r.points,sd);const svDef=D.sv?.[cls];
  const validSv=new Set();for(const info of Object.values(D.dpc)){if(info[0]+info[1]===cls)validSv.add(info[3]);}
  const Row=({l,v,c})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #E0E0E0"}}><span style={{color:"#737373",fontSize:14}}>{l}</span><span style={{color:c||"#404040",fontSize:14,fontWeight:500,textAlign:"right",maxWidth:"60%"}}>{v}</span></div>);
  const Sec=({title,children})=>{const[o,setO]=useState(false);return(<div style={{marginTop:8}}><button onClick={()=>setO(!o)} aria-expanded={o} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#737373",cursor:"pointer",fontSize:13,fontWeight:600,padding:0}}><span style={{transform:o?"rotate(90deg)":"none",transition:"transform .15s",display:"inline-block"}}>▸</span>{title}</button>{o&&<div style={{marginTop:6,background:"#FAFAFA",borderRadius:6,padding:8,maxHeight:180,overflow:"auto"}}>{children}</div>}</div>);};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={`DPC詳細 ${r.code}`} style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #E0E0E0",boxShadow:"0 16px 48px rgba(0,0,0,.12)",maxWidth:"90vw",width:520,maxHeight:"85vh",overflow:"auto",padding:0}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E0E0E0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{color:"#3B82F6",fontFamily:M,fontSize:20,fontWeight:700}}>{r.code}</span>
              {r.isDekidaka&&<span style={{background:"#EF4444",color:"#fff",borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:700}}>出来高</span>}
            </div>
            <div style={{color:"#737373",fontSize:14}}>{r.clsName}</div>
            {r.condLabel&&<div style={{color:"#F59E0B",fontSize:13,marginTop:2}}>{r.condLabel}</div>}
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{background:"#F5F5F5",border:"none",color:"#737373",cursor:"pointer",width:32,height:32,borderRadius:6,fontSize:14,flexShrink:0,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#E8E8E8"} onMouseLeave={e=>e.currentTarget.style.background="#F5F5F5"}>✕</button>
        </div>
        {!r.isDekidaka?(
          <div style={{padding:"16px 20px",borderBottom:"1px solid #E0E0E0"}}>
            <div style={{display:"flex",gap:0}}>
              {["Ⅰ","Ⅱ","Ⅲ"].map((l,i)=>(
                <div key={i} style={{flex:1,textAlign:"center",padding:"10px 0",background:i===0?"rgba(59,130,246,.06)":"transparent",borderRadius:i===0?8:0}}>
                  <div style={{color:"#737373",fontSize:12}}>期間{l}（{r.days[i]||"-"}日）</div>
                  <div style={{fontFamily:M,fontWeight:700,color:i===0?"#3B82F6":"#737373",fontSize:i===0?26:18}}>{r.points[i]?.toLocaleString()||"-"}</div>
                  <div style={{color:"#737373",fontSize:11}}>点/日</div>
                </div>
              ))}
            </div>
            {tot&&(<div style={{background:"#FAFAFA",borderRadius:8,padding:12,textAlign:"center",marginTop:10}}>
              <div style={{color:"#737373",fontSize:12}}>{sd}日入院の総点数{tot.overDays>0?<span style={{color:"#EF4444"}}> （うち{tot.overDays}日は出来高）</span>:""}</div>
              <div style={{fontFamily:M,fontWeight:800,color:"#F59E0B",fontSize:28}}>{tot.total.toLocaleString()}<span style={{fontSize:13,color:"#737373",fontWeight:400}}>点</span></div>
            </div>)}
            <button onClick={()=>setShowChart(true)} style={{width:"100%",marginTop:8,padding:"8px 0",background:"#FAFAFA",border:"1px solid #E0E0E0",borderRadius:6,color:"#3B82F6",cursor:"pointer",fontSize:13,fontWeight:600,transition:"background .15s, border-color .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#F0F0F0";e.currentTarget.style.borderColor="#D4D4D4";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#FAFAFA";e.currentTarget.style.borderColor="#E0E0E0";}}>点数推移グラフ</button>
          </div>
        ):(
          <div style={{padding:"16px 20px",borderBottom:"1px solid #E0E0E0"}}>
            <div style={{background:"rgba(239,68,68,.06)",borderRadius:8,padding:14,textAlign:"center"}}>
              <div style={{color:"#EF4444",fontSize:16,fontWeight:700}}>出来高算定</div>
              <div style={{color:"#737373",fontSize:13,marginTop:2}}>DPC包括対象外</div>
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
              <div style={{background:"#FAFAFA",borderRadius:6,padding:8,marginBottom:4,maxHeight:120,overflowY:"auto"}}>
                <div style={{fontSize:11,color:"#737373",fontWeight:600,marginBottom:4}}>副傷病 対象ICD（{sdICDs.length}件）</div>
                {sdICDs.map((ic,i)=>(
                  <div key={i} style={{fontSize:12,color:"#737373",padding:"1px 0",display:"flex",gap:6}}>
                    <span style={{color:"#EA580C",fontFamily:M,flexShrink:0,minWidth:48,fontSize:11}}>{ic.code}{ic.isPrefix?"~":""}</span>
                    <span>{ic.name||""}</span>
                  </div>
                ))}
              </div>
            ):null;
          })()}
          {r.severity&&<Row l={`重症度等（${r.severity.name}）`} v={r.severity.label} c="#F59E0B" />}
          {r.condLabel&&<Row l="病態等分類" v={r.condLabel} c="#F59E0B" />}
        </div>
        {svDef&&Object.keys(svDef).filter(k=>k!=="name").length>1&&(
          <div style={{padding:"0 20px 12px"}}>
            <div style={{color:"#737373",fontSize:12,fontWeight:600,marginBottom:6}}>重症度分岐 ─ {svDef.name}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {Object.entries(svDef).filter(([k])=>k!=="name").sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([v,lb])=>{
                const cur=r.severity?.value===v;
                return(<div key={v} style={{background:cur?"rgba(245,158,11,.08)":"#FAFAFA",border:cur?"1px solid #F59E0B":"1px solid #E0E0E0",borderRadius:4,padding:"4px 8px",fontSize:12}}>
                  <span style={{fontFamily:M,color:cur?"#F59E0B":"#3B82F6",fontWeight:cur?700:400,fontSize:11}}>[{v}]</span>{" "}
                  <span style={{color:cur?"#F59E0B":"#737373"}}>{lb}</span>
                </div>);
              })}
            </div>
          </div>
        )}
        <div style={{padding:"0 20px 16px"}}>
          <Sec title={`対象ICD-10（${icds.length}件）`}>
            {icds.slice(0,100).map((c,i)=>(<div key={i} style={{fontSize:12,color:"#737373",padding:"2px 0",display:"flex",gap:6}}><span style={{color:"#3B82F6",fontFamily:M,flexShrink:0,minWidth:48,fontSize:11}}>{c}</span><span>{cleanName(D.icn[c]||"")}</span></div>))}
            {icds.length>100&&<div style={{color:"#737373",fontSize:11,marginTop:2}}>他{icds.length-100}件</div>}
          </Sec>
          <Sec title={`手術定義（${Object.entries(si).filter(([c])=>validSv.has(c)).length}区分）`}>
            {Object.entries(si).filter(([c])=>validSv.has(c)).sort((a,b)=>{if(a[0]==="99")return 1;if(b[0]==="99")return-1;if(a[0]==="97")return 1;if(b[0]==="97")return-1;return a[0].localeCompare(b[0]);}).map(([corr,idx],i)=>(
              <div key={i} style={{color:"#404040",marginBottom:3,fontSize:12}}>
                <span style={{fontFamily:M,color:corr===r.surgVal?"#F59E0B":"#3B82F6",fontWeight:corr===r.surgVal?700:400,fontSize:11}}>[{corr}]</span>{" "}
                {D.sl[idx]?.slice(0,3).map(k=>`${k}(${(D.cn[k]||"").slice(0,15)})`).join(", ")}
              </div>
            ))}
          </Sec>
          {r.hasP1Branch&&Object.keys(p1e).length>0&&(
            <Sec title={`処置等１定義（${Object.keys(p1e).length}区分）`}>
              {Object.entries(p1e).sort((a,b)=>parseInt(b[0]||0)-parseInt(a[0]||0)).map(([corr,codes],i)=>(<div key={i} style={{color:"#404040",marginBottom:3,fontSize:12}}><span style={{fontFamily:M,color:corr===r.p1Val?"#F59E0B":"#3B82F6",fontWeight:corr===r.p1Val?700:400,fontSize:11}}>[{corr}]</span>{" "}{codes.slice(0,3).map(c=>`${c}(${(D.cn[c]||"").slice(0,15)})`).join(", ")}</div>))}
            </Sec>
          )}
          {r.hasP2Branch&&Object.keys(p2e).length>0&&(
            <Sec title={`処置等２定義（${Object.keys(p2e).length}区分）`}>
              {Object.entries(p2e).sort((a,b)=>parseInt(b[0]||0)-parseInt(a[0]||0)).map(([corr,codes],i)=>(<div key={i} style={{color:"#404040",marginBottom:3,fontSize:12}}><span style={{fontFamily:M,color:corr===r.p2Val?"#F59E0B":"#3B82F6",fontWeight:corr===r.p2Val?700:400,fontSize:11}}>[{corr}]</span>{" "}{codes.slice(0,3).map(c=>{const n=D.cn[c]||"";const a=D.da?.[c];const d=a?.length?`${n}(${a[0]})`:n;return`${c}(${d.slice(0,20)})`;}).join(", ")}</div>))}
            </Sec>
          )}
          <SimilarCls cls={cls} onSearch={onSearchCls}/>
        </div>
      </div>
      {showChart&&<SimChart r={r} sd={sd} onClose={()=>setShowChart(false)}/>}
    </div>
  );
}
