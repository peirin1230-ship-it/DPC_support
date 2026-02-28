import { useState } from "react";
import { D } from "../data";
import { M } from "../styles";
import { normalize, cleanName } from "../utils";
import useModal from "../useModal";

export default function IcdPanel({results,onClose}){
  const modalRef=useModal(onClose);
  const clsSet=new Set(results.map(r=>r.cls));const clsList=[...clsSet];const[ft,setFt]=useState("");const qn=normalize(ft);
  const all=[];const seen=new Set();
  for(const cls of clsList){for(const c of(D.icd[cls]||[])){if(!seen.has(c)){seen.add(c);all.push({code:c,name:cleanName(D.icn[c]||""),cls});}}}
  const filtered=ft?all.filter(x=>x.code.includes(ft)||x.name.includes(ft)||normalize(x.code).includes(qn)||normalize(x.name).includes(qn)):all;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="対象ICD-10一覧" style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #E0E0E0",boxShadow:"0 16px 48px rgba(0,0,0,.12)",maxWidth:"90vw",width:600,maxHeight:"85vh",display:"flex",flexDirection:"column",padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontSize:16,fontWeight:700,color:"#262626"}}>対象ICD-10一覧</div><div style={{fontSize:12,color:"#737373"}}>{clsList.length}分類 / {all.length}コード</div></div>
          <button onClick={onClose} aria-label="閉じる" style={{background:"#F5F5F5",border:"none",color:"#737373",cursor:"pointer",width:40,height:40,borderRadius:8,transition:"background .15s",display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background="#E8E8E8"} onMouseLeave={e=>e.currentTarget.style.background="#F5F5F5"}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg></button>
        </div>
        <label htmlFor="icd-filter" className="sr-only" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>コードまたは病名で絞り込み</label>
        <input id="icd-filter" value={ft} onChange={e=>setFt(e.target.value)} placeholder="コードまたは病名で絞り込み..."
          style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:8,transition:"border-color .15s, box-shadow .15s"}}
          onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";}} onBlur={e=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";}} />
        <div style={{fontSize:11,color:"#737373",marginBottom:4}}>{filtered.length}件</div>
        <div style={{flex:1,overflow:"auto",background:"#FAFAFA",borderRadius:6,padding:6}}>
          {filtered.slice(0,500).map((x,i)=>(
            <div key={i} style={{fontSize:13,color:"#737373",padding:"3px 0",display:"flex",gap:8,borderBottom:"1px solid #F0F0F0"}}>
              <span style={{color:"#3B82F6",fontFamily:M,flexShrink:0,minWidth:48,fontSize:12}}>{x.code}</span>
              <span>{x.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
