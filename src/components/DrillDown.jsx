import { useState } from "react";
import { D } from "../data";
import { M } from "../styles";

export default function DrillDown({options,drillP1,drillP2,onSelectP1,onSelectP2,onClear}){
  const{p1Items,p2Items}=options;
  const hasOptions=p1Items.length>0||p2Items.length>0;
  const hasSelection=!!(drillP1||drillP2);
  const[collapsed,setCollapsed]=useState(false);
  if(!hasOptions&&!hasSelection)return null;

  const renderItems=(items,onSelect)=>{
    if(items.length===0)return null;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {items.map((item,i)=>{
          const dispName=item.drugAlias?`${item.name}（${item.drugAlias.slice(0,15)}）`:item.name;
          return(
            <div key={i} onClick={()=>onSelect(item.code)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"#FAFAFA",borderRadius:4,cursor:"pointer",fontSize:12,border:"1px solid #E0E0E0",transition:"background .15s, border-color .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#D4D4D4";e.currentTarget.style.background="#F5F5F5";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E0E0E0";e.currentTarget.style.background="#FAFAFA";}}>
              <span style={{color:"#3B82F6",fontFamily:M,fontSize:11,flexShrink:0,minWidth:70}}>{item.code}</span>
              <span style={{color:"#404040",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dispName?dispName.slice(0,30):""}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const totalCount=p1Items.length+p2Items.length;

  return(
    <div style={{background:"#FFFFFF",border:"1px solid #E0E0E0",borderRadius:8,padding:"10px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:collapsed?0:(hasOptions||hasSelection?8:0)}}>
        <button onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0}}>
          <span style={{color:"#737373",transform:collapsed?"none":"rotate(90deg)",transition:"transform .15s",display:"inline-block",fontSize:12}}>▸</span>
          <span style={{fontSize:13,fontWeight:700,color:"#262626"}}>他に評価される項目</span>
          {collapsed&&totalCount>0&&<span style={{fontSize:11,color:"#737373"}}>（{totalCount}件）</span>}
        </button>
        <div style={{display:"flex",gap:6}}>
          {hasSelection&&(
            <button onClick={onClear} style={{padding:"3px 10px",background:"#F2F2F2",border:"1px solid #E0E0E0",borderRadius:4,color:"#737373",cursor:"pointer",fontSize:11}}>選択をクリア</button>
          )}
        </div>
      </div>
      {!collapsed&&(
        <>
          {drillP1&&(
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.2)",borderRadius:4,marginBottom:6,fontSize:12}}>
              <span style={{color:"#10B981",flexShrink:0}}>選択中 処置等1:</span>
              <span style={{color:"#3B82F6",fontFamily:M}}>{drillP1}</span>
              <span style={{color:"#737373",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{D.cn[drillP1]||""}</span>
            </div>
          )}
          {drillP2&&(
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.2)",borderRadius:4,marginBottom:6,fontSize:12}}>
              <span style={{color:"#10B981",flexShrink:0}}>選択中 処置等2:</span>
              <span style={{color:"#3B82F6",fontFamily:M}}>{drillP2}</span>
              <span style={{color:"#737373",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{D.cn[drillP2]||""}{D.da?.[drillP2]?.[0]?`（${D.da[drillP2][0]}）`:""}</span>
            </div>
          )}
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {p1Items.length>0&&(
              <div style={{marginBottom:p2Items.length>0?8:0}}>
                <div style={{fontSize:11,color:"#737373",fontWeight:600,marginBottom:4}}>手術・処置等1</div>
                {renderItems(p1Items,onSelectP1)}
              </div>
            )}
            {p2Items.length>0&&(
              <div>
                <div style={{fontSize:11,color:"#737373",fontWeight:600,marginBottom:4}}>手術・処置等2</div>
                {renderItems(p2Items,onSelectP2)}
              </div>
            )}
          </div>
          {!hasOptions&&hasSelection&&(
            <div style={{fontSize:12,color:"#737373",textAlign:"center",padding:4}}>これ以上評価される項目はありません</div>
          )}
        </>
      )}
    </div>
  );
}
