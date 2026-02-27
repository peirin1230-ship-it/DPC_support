import { useState, useRef, useEffect } from "react";
import { M } from "../styles";

export default function AC({label,value,onChange,onSelect,searchFn,placeholder,showTag}){
  const[open,setOpen]=useState(false);const[res,setRes]=useState([]);const[hi,setHi]=useState(-1);const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const handleKey=e=>{
    if(!open||res.length===0){return;}
    if(e.key==="ArrowDown"){e.preventDefault();setHi(p=>(p+1)%res.length);}
    else if(e.key==="ArrowUp"){e.preventDefault();setHi(p=>(p-1+res.length)%res.length);}
    else if(e.key==="Enter"&&hi>=0){e.preventDefault();e.stopPropagation();onSelect(res[hi]);setOpen(false);setHi(-1);}
    else if(e.key==="Escape"){setOpen(false);setHi(-1);}
  };

  return(
    <div ref={ref} style={{position:"relative"}}>
      <label style={{display:"block",fontSize:11,color:"#737373",marginBottom:3,fontWeight:600}}>{label}</label>
      <input value={value} onChange={e=>{const v=e.target.value;onChange(v);if(v.length>=1){setRes(searchFn(v));setOpen(true);setHi(-1);}else{setOpen(false);setHi(-1);}}}
        onFocus={e=>{e.target.style.borderColor="#404040";e.target.style.boxShadow="0 0 0 3px rgba(64,64,64,.1)";if(value&&res.length)setOpen(true);}}
        onBlur={e=>{setTimeout(()=>{e.target.style.borderColor="#E0E0E0";e.target.style.boxShadow="none";},120);}}
        onKeyDown={handleKey}
        placeholder={placeholder}
        role="combobox" aria-expanded={open&&res.length>0} aria-autocomplete="list" aria-activedescendant={hi>=0?`ac-opt-${hi}`:undefined}
        style={{width:"100%",padding:"8px 10px",border:"1.5px solid #E0E0E0",borderRadius:6,background:"#FFFFFF",color:"#404040",fontSize:14,outline:"none",boxSizing:"border-box",transition:"border-color .15s, box-shadow .15s"}} />
      {open&&res.length>0&&(
        <div role="listbox" style={{position:"absolute",top:"100%",left:0,right:0,background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:6,maxHeight:200,overflow:"auto",zIndex:100,boxShadow:"0 8px 32px rgba(0,0,0,.08)",marginTop:2}}>
          {res.map((r,i)=>(
            <div key={i} id={`ac-opt-${i}`} role="option" aria-selected={i===hi}
              onMouseDown={()=>{onSelect(r);setOpen(false);setHi(-1);}}
              onMouseEnter={()=>setHi(i)}
              style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid #F5F5F5",fontSize:13,color:"#404040",display:"flex",gap:8,alignItems:"center",transition:"background .15s",background:i===hi?"#F5F5F5":"transparent"}}>
              <span style={{color:r.dk?"#EF4444":"#3B82F6",fontFamily:M,fontSize:12,flexShrink:0}}>{r.code}</span>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{r.name}</span>
              {showTag&&r.tag&&<span style={{background:"#F2F2F2",color:"#737373",borderRadius:3,padding:"1px 5px",fontSize:10,flexShrink:0}}>{r.tag}</span>}
              {r.dk&&<span style={{background:"#FEF2F2",color:"#EF4444",borderRadius:3,padding:"1px 5px",fontSize:10,flexShrink:0}}>包括対象外</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
