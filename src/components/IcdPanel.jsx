import { useState } from "react";
import { D } from "../data";
import { M } from "../styles";
import { normalize, cleanName } from "../utils";

export default function IcdPanel({results,onClose}){
  const clsSet=new Set(results.map(r=>r.cls));const clsList=[...clsSet];const[ft,setFt]=useState("");const qn=normalize(ft);
  const all=[];const seen=new Set();
  for(const cls of clsList){for(const c of(D.icd[cls]||[])){if(!seen.has(c)){seen.add(c);all.push({code:c,name:cleanName(D.icn[c]||""),cls});}}}
  const filtered=ft?all.filter(x=>x.code.includes(ft)||x.name.includes(ft)||normalize(x.code).includes(qn)||normalize(x.name).includes(qn)):all;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#111827",borderRadius:12,border:"1px solid #1e293b",maxWidth:"90vw",width:600,maxHeight:"85vh",display:"flex",flexDirection:"column",padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontSize:16,fontWeight:700,color:"#f1f5f9"}}>対象ICD-10一覧</div><div style={{fontSize:12,color:"#64748b"}}>{clsList.length}分類 / {all.length}コード</div></div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",color:"#94a3b8",cursor:"pointer",width:32,height:32,borderRadius:6,fontSize:14}}>✕</button>
        </div>
        <input value={ft} onChange={e=>setFt(e.target.value)} placeholder="コードまたは病名で絞り込み..."
          style={{width:"100%",padding:"8px 10px",border:"1.5px solid #1e293b",borderRadius:6,background:"#0a0f1a",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:8}}
          onFocus={e=>e.target.style.borderColor="#38bdf8"} onBlur={e=>e.target.style.borderColor="#1e293b"} />
        <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{filtered.length}件</div>
        <div style={{flex:1,overflow:"auto",background:"#0a0f1a",borderRadius:6,padding:6}}>
          {filtered.slice(0,500).map((x,i)=>(
            <div key={i} style={{fontSize:13,color:"#94a3b8",padding:"3px 0",display:"flex",gap:8,borderBottom:"1px solid #111827"}}>
              <span style={{color:"#38bdf8",fontFamily:M,flexShrink:0,minWidth:48,fontSize:12}}>{x.code}</span>
              <span>{x.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
