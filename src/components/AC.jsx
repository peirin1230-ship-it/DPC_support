import { useState, useRef, useEffect } from "react";
import { M } from "../styles";

export default function AC({label,value,onChange,onSelect,searchFn,placeholder,showTag}){
  const[open,setOpen]=useState(false);const[res,setRes]=useState([]);const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <label style={{display:"block",fontSize:11,color:"#64748b",marginBottom:3,fontWeight:600}}>{label}</label>
      <input value={value} onChange={e=>{const v=e.target.value;onChange(v);if(v.length>=1){setRes(searchFn(v));setOpen(true);}else setOpen(false);}}
        onFocus={e=>{e.target.style.borderColor="#38bdf8";if(value&&res.length)setOpen(true);}}
        onBlur={e=>{setTimeout(()=>{e.target.style.borderColor="#1e293b";},120);}}
        placeholder={placeholder}
        style={{width:"100%",padding:"8px 10px",border:"1.5px solid #1e293b",borderRadius:6,background:"#0a0f1a",color:"#e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}} />
      {open&&res.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e293b",border:"1px solid #334155",borderRadius:6,maxHeight:200,overflow:"auto",zIndex:100,boxShadow:"0 8px 32px rgba(0,0,0,.5)",marginTop:2}}>
          {res.map((r,i)=>(
            <div key={i} onMouseDown={()=>{onSelect(r);setOpen(false);}}
              style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid #283548",fontSize:13,color:"#cbd5e1",display:"flex",gap:8,alignItems:"center"}}
              onMouseEnter={e=>e.currentTarget.style.background="#283548"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:r.dk?"#ef4444":"#38bdf8",fontFamily:M,fontSize:12,flexShrink:0}}>{r.code}</span>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{r.name}</span>
              {showTag&&r.tag&&<span style={{background:"#334155",color:"#94a3b8",borderRadius:3,padding:"1px 5px",fontSize:10,flexShrink:0}}>{r.tag}</span>}
              {r.dk&&<span style={{background:"#7f1d1d",color:"#fca5a5",borderRadius:3,padding:"1px 5px",fontSize:10,flexShrink:0}}>包括対象外</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
