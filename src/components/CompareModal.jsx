import { M } from "../styles";
import { calcTotal } from "../utils";

export default function CompareModal({items,onClose,sd}){
  if(!items||items.length<2)return null;
  const ti=items.map(r=>calcTotal(r.days,r.points,sd));
  const tots=ti.map(t=>t?t.total:0);
  const hasSev=items.some(r=>r.severity);const hasCond=items.some(r=>r.condLabel);
  // "num" flag: field where higher=better (points) or just numeric comparison (periods)
  // "hib"=higher is better, "lib"=lower is better
  const fields=[
    ["DPC",r=>r.code,1],["分類",r=>r.clsName],
    ...(hasCond?[["条件",r=>r.condLabel||"-"]]:[]),
    ["手術",r=>r.surgeryName||"なし"],["処置1",r=>r.proc1Name],["処置2",r=>r.proc2Name],["副傷病",r=>r.subdiagName],
    ...(hasSev?[["重症度",r=>r.severity?r.severity.label:"-"]]:[]),
    ["区分",r=>r.isDekidaka?"出来高":"包括"],
    ["期間Ⅰ",r=>r.days[0]||0,1,"hib"],["期間Ⅱ",r=>r.days[1]||0,1,"hib"],["期間Ⅲ",r=>r.days[2]||0,1,"hib"],
    ["点数Ⅰ/日",r=>r.points[0]||0,1,"hib"],["点数Ⅱ/日",r=>r.points[1]||0,1,"hib"],["点数Ⅲ/日",r=>r.points[2]||0,1,"hib"],
  ];
  // Precompute min/max for numeric fields
  const numInfo=fields.map(([,fn,,cmp])=>{
    if(!cmp)return null;
    const vals=items.map((it)=>{const v=fn(it);return typeof v==="number"?v:0;});
    const nonZero=vals.filter(v=>v>0);
    if(nonZero.length<2)return null;
    return{max:Math.max(...nonZero),min:Math.min(...nonZero)};
  });

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#111827",borderRadius:12,border:"1px solid #1e293b",maxWidth:"94vw",maxHeight:"85vh",overflow:"auto",padding:20,minWidth:400}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:700,color:"#f1f5f9"}}>DPC比較{sd?` （${sd}日入院）`:""}</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",color:"#94a3b8",cursor:"pointer",width:32,height:32,borderRadius:6,fontSize:14}}>✕</button>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <tbody>
            {fields.map(([lb,fn,mono,cmp],fi)=>{
              const vs=items.map(fn);const same=vs.every(v=>v===vs[0]);
              const ni=numInfo[fi];
              return(<tr key={fi}>
                <td style={{padding:"6px 10px",background:"#0a0f1a",color:"#94a3b8",fontWeight:600,borderBottom:"1px solid #1e293b",fontSize:12,whiteSpace:"nowrap"}}>{lb}</td>
                {items.map((it,ii)=>{
                  const v=fn(it);const dk=lb==="区分"&&v==="出来高";const diff=!same&&fi>0;
                  // Color coding for numeric fields
                  let cellColor=dk?"#ef4444":diff?"#fbbf24":"#cbd5e1";
                  let cellBg="transparent";
                  if(ni&&typeof v==="number"&&v>0){
                    if(v===ni.max&&ni.max!==ni.min){cellColor="#38bdf8";cellBg="rgba(56,189,248,.06)";}
                    else if(v===ni.min&&ni.max!==ni.min){cellColor="#ef4444";cellBg="rgba(239,68,68,.06)";}
                  }
                  const dispVal=cmp?(v>0?(lb.startsWith("期間")?v+"日":v.toLocaleString()):"-"):v;
                  return(<td key={ii} style={{padding:"6px 10px",borderBottom:"1px solid #1e293b",color:cellColor,fontWeight:dk||(ni&&v===ni.max)?700:diff?600:400,fontFamily:mono?M:"inherit",background:cellBg}}>{dispVal}</td>);
                })}
              </tr>);
            })}
            {sd>0&&(
              <tr><td style={{padding:"8px 10px",background:"#0f172a",color:"#38bdf8",fontWeight:700,borderBottom:"1px solid #1e293b",fontSize:13}}>総点数</td>
                {items.map((it,ii)=>{
                  const t=tots[ii];const maxT=Math.max(...tots.filter(x=>x>0));const minT=Math.min(...tots.filter(x=>x>0));
                  const best=t===maxT&&t>0&&maxT!==minT;const worst=t===minT&&t>0&&maxT!==minT;
                  return(<td key={ii} style={{padding:"8px 10px",borderBottom:"1px solid #1e293b",color:it.isDekidaka?"#ef4444":best?"#38bdf8":worst?"#ef4444":"#cbd5e1",fontWeight:700,fontFamily:M,fontSize:16,background:best?"rgba(56,189,248,.06)":worst?"rgba(239,68,68,.06)":"#0f172a"}}>{it.isDekidaka?"出来高":(t?t.toLocaleString():"-")}</td>);
                })}</tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
