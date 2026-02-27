import { M } from "../styles";
import { calcTotal } from "../utils";
import { buildStepPath } from "./SimChart";
import useModal from "../useModal";

// 比較用カラーパレット（最大4つ）- コントラストが高い配色
const CMP_CLR = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];
// 線が重なっても区別できるよう線種を使い分ける
const CMP_DASH = ["", "8 4", "4 4", "12 3 4 3"];

// 比較チャート — 複数DPCの点数推移を重ねて表示
function CompareChart({ items, sd }) {
  const nonDk = items.filter(r => !r.isDekidaka);
  if (nonDk.length === 0) return null;

  const maxDay = Math.max(...nonDk.map(r => {
    const base = r.days[2] || r.days[1] || r.days[0] || 30;
    return sd > 0 ? Math.max(base + 3, sd + 2) : base + 5;
  }));
  const maxPts = Math.max(...nonDk.flatMap(r => r.points.filter(Boolean)), 1);

  const W = 580, H = 280, PL = 56, PR = 16, PT = 24, PB = 36;
  const cW = W - PL - PR, cH = H - PT - PB;
  const xFn = d => PL + (d / maxDay) * cW;
  const yFn = v => PT + cH - (v / maxPts) * cH;
  const y0 = PT + cH;

  // Y軸目盛り
  const yStep = Math.max(1, Math.ceil(maxPts / 4 / 100) * 100);
  const yTicks = [];
  for (let v = 0; v <= maxPts; v += yStep) yTicks.push(v);

  // 全DPCの境界日を集めてX軸ラベルに使う
  const allBounds = new Set();
  nonDk.forEach(r => r.days.filter(Boolean).forEach(d => allBounds.add(d)));

  // 各DPCのステップパスを計算
  const paths = nonDk.map((r, i) => ({
    ...buildStepPath(r.days, r.points, xFn, yFn, y0),
    color: CMP_CLR[i % CMP_CLR.length],
    dash: CMP_DASH[i % CMP_DASH.length],
    code: r.code,
    days: r.days,
    points: r.points
  }));

  return (
    <div style={{ marginBottom: 14, background: "#FAFAFA", borderRadius: 8, padding: "12px 8px 8px" }}>
      <div style={{ fontSize: 12, color: "#737373", fontWeight: 600, marginBottom: 8, paddingLeft: 8 }}>点数推移比較（点/日）</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label={`DPC比較チャート: ${nonDk.map(r=>r.code).join(" vs ")}`}>
        {/* Y軸目盛り */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={yFn(v)} x2={W - PR} y2={yFn(v)} stroke="#E0E0E0" strokeWidth="0.5" />
            <text x={PL - 6} y={yFn(v) + 4} textAnchor="end" fill="#737373" fontSize="9" fontFamily={M}>{v.toLocaleString()}</text>
          </g>
        ))}

        {/* 境界日の縦ガイド線 */}
        {[...allBounds].sort((a, b) => a - b).map(dv => (
          <g key={dv}>
            <line x1={xFn(dv)} y1={PT} x2={xFn(dv)} y2={y0} stroke="#E0E0E0" strokeWidth="0.5" strokeDasharray="3 3" />
            <text x={xFn(dv)} y={y0 + 14} textAnchor="middle" fill="#737373" fontSize="8" fontFamily={M}>{dv}日</text>
          </g>
        ))}

        {/* 各DPCの塗りつぶし（薄く） */}
        {paths.map((p, i) => (
          <path key={`f${i}`} d={p.fill} fill={p.color} opacity="0.06" />
        ))}

        {/* 各DPCのステップ線 + 段差の縦線 + 境界ドット */}
        {paths.map((p, pi) => (
          <g key={`g${pi}`}>
            {p.segs.map((s, j) => (
              <g key={j}>
                {/* 水平線 */}
                <line x1={xFn(s.x0)} y1={yFn(s.y)} x2={xFn(s.x1)} y2={yFn(s.y)}
                  stroke={p.color} strokeWidth="3" strokeDasharray={p.dash} strokeLinecap="round" />
                {/* 段差の縦点線 */}
                {j > 0 && <line x1={xFn(s.x0)} y1={yFn(p.segs[j-1].y)} x2={xFn(s.x0)} y2={yFn(s.y)}
                  stroke={p.color} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />}
                {/* 境界ドット */}
                <circle cx={xFn(s.x0)} cy={yFn(s.y)} r="3.5" fill={p.color} />
                {j === p.segs.length - 1 && <circle cx={xFn(s.x1)} cy={yFn(s.y)} r="3.5" fill={p.color} />}
              </g>
            ))}
            {/* 点数値ラベル — 各期間の中間上に表示 */}
            {p.segs.map((s, j) => {
              const mx = (xFn(s.x0) + xFn(s.x1)) / 2;
              // 重なり回避: DPCごとにラベルを少し上下にずらす
              const offset = -8 - pi * 13;
              return (
                <text key={`t${j}`} x={mx} y={yFn(s.y) + offset} textAnchor="middle"
                  fill={p.color} fontSize="10" fontWeight="700" fontFamily={M}>
                  {s.y.toLocaleString()}
                </text>
              );
            })}
          </g>
        ))}

        {/* 入院日数マーカー */}
        {sd > 0 && sd <= maxDay && (
          <g>
            <line x1={xFn(sd)} y1={PT} x2={xFn(sd)} y2={y0} stroke="#EF4444" strokeWidth="2" />
            <rect x={xFn(sd) - 16} y={PT - 4} width="32" height="14" rx="3" fill="#EF4444" />
            <text x={xFn(sd)} y={PT + 7} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{sd}日</text>
          </g>
        )}

        {/* X軸 */}
        <line x1={PL} y1={y0} x2={W - PR} y2={y0} stroke="#D4D4D4" strokeWidth="1" />
      </svg>
      {/* 凡例 — 大きくわかりやすく */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 8, flexWrap: "wrap" }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={p.color} strokeWidth="3" strokeDasharray={p.dash} strokeLinecap="round" /><circle cx="12" cy="5" r="3" fill={p.color} /></svg>
            <span style={{ color: p.color, fontFamily: M, fontWeight: 700, fontSize: 12 }}>{p.code}</span>
          </div>
        ))}
        {sd > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="10"><line x1="12" y1="0" x2="12" y2="10" stroke="#EF4444" strokeWidth="2" /></svg>
            <span style={{ color: "#EF4444", fontSize: 11 }}>{sd}日入院</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompareModal({items,onClose,sd}){
  const modalRef=useModal(onClose);
  if(!items||items.length<2)return null;
  const ti=items.map(r=>calcTotal(r.days,r.points,sd));
  const tots=ti.map(t=>t?t.total:0);
  const hasSev=items.some(r=>r.severity);const hasCond=items.some(r=>r.condLabel);
  const fields=[
    ["DPC",r=>r.code,1],["分類",r=>r.clsName],
    ...(hasCond?[["条件",r=>r.condLabel||"-"]]:[]),
    ["手術",r=>r.surgeryName||"なし"],["処置1",r=>r.proc1Name],["処置2",r=>r.proc2Name],["副傷病",r=>r.subdiagName],
    ...(hasSev?[["重症度",r=>r.severity?r.severity.label:"-"]]:[]),
    ["区分",r=>r.isDekidaka?"出来高":"包括"],
    ["期間I",r=>r.days[0]||0,1,"hib"],["期間II",r=>r.days[1]||0,1,"hib"],["期間III",r=>r.days[2]||0,1,"hib"],
    ["点数I/日",r=>r.points[0]||0,1,"hib"],["点数II/日",r=>r.points[1]||0,1,"hib"],["点数III/日",r=>r.points[2]||0,1,"hib"],
  ];
  const numInfo=fields.map(([,fn,,cmp])=>{
    if(!cmp)return null;
    const vals=items.map((it)=>{const v=fn(it);return typeof v==="number"?v:0;});
    const nonZero=vals.filter(v=>v>0);
    if(nonZero.length<2)return null;
    return{max:Math.max(...nonZero),min:Math.min(...nonZero)};
  });

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="DPC比較" style={{background:"#FFFFFF",borderRadius:12,border:"1px solid #E0E0E0",boxShadow:"0 16px 48px rgba(0,0,0,.12)",maxWidth:"94vw",maxHeight:"85vh",overflow:"auto",padding:20,minWidth:400}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:16,fontWeight:700,color:"#262626"}}>DPC比較{sd?` （${sd}日入院）`:""}</div>
          <button onClick={onClose} aria-label="閉じる" style={{background:"#F5F5F5",border:"none",color:"#737373",cursor:"pointer",width:32,height:32,borderRadius:6,fontSize:14,transition:"background .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#E8E8E8"} onMouseLeave={e=>e.currentTarget.style.background="#F5F5F5"}>✕</button>
        </div>

        {/* 比較チャート */}
        <CompareChart items={items} sd={sd} />

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <tbody>
            {fields.map(([lb,fn,mono,cmp],fi)=>{
              const vs=items.map(fn);const same=vs.every(v=>v===vs[0]);
              const ni=numInfo[fi];
              return(<tr key={fi}>
                <td style={{padding:"6px 10px",background:"#FAFAFA",color:"#737373",fontWeight:600,borderBottom:"1px solid #E0E0E0",fontSize:12,whiteSpace:"nowrap"}}>{lb}</td>
                {items.map((it,ii)=>{
                  const v=fn(it);const dk=lb==="区分"&&v==="出来高";const diff=!same&&fi>0;
                  let cellColor=dk?"#EF4444":diff?"#F59E0B":"#404040";
                  let cellBg="transparent";
                  if(ni&&typeof v==="number"&&v>0){
                    if(v===ni.max&&ni.max!==ni.min){cellColor="#3B82F6";cellBg="rgba(59,130,246,.06)";}
                    else if(v===ni.min&&ni.max!==ni.min){cellColor="#EF4444";cellBg="rgba(239,68,68,.06)";}
                  }
                  // DPC行にカラー丸をつけて凡例と対応
                  const dpcDot = lb==="DPC" ? <span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:CMP_CLR[ii%CMP_CLR.length],marginRight:6,verticalAlign:"middle"}} /> : null;
                  const dispVal=cmp?(v>0?(lb.startsWith("期間")?v+"日":v.toLocaleString()):"-"):v;
                  return(<td key={ii} style={{padding:"6px 10px",borderBottom:"1px solid #E0E0E0",color:cellColor,fontWeight:dk||(ni&&v===ni.max)?700:diff?600:400,fontFamily:mono?M:"inherit",background:cellBg}}>{dpcDot}{dispVal}</td>);
                })}
              </tr>);
            })}
            {sd>0&&(
              <tr><td style={{padding:"8px 10px",background:"#FAFAFA",color:"#3B82F6",fontWeight:700,borderBottom:"1px solid #E0E0E0",fontSize:13}}>総点数</td>
                {items.map((it,ii)=>{
                  const t=tots[ii];const maxT=Math.max(...tots.filter(x=>x>0));const minT=Math.min(...tots.filter(x=>x>0));
                  const best=t===maxT&&t>0&&maxT!==minT;const worst=t===minT&&t>0&&maxT!==minT;
                  return(<td key={ii} style={{padding:"8px 10px",borderBottom:"1px solid #E0E0E0",color:it.isDekidaka?"#EF4444":best?"#3B82F6":worst?"#EF4444":"#404040",fontWeight:700,fontFamily:M,fontSize:16,background:best?"rgba(59,130,246,.06)":worst?"rgba(239,68,68,.06)":"#FAFAFA"}}>{it.isDekidaka?"出来高":(t?t.toLocaleString():"-")}</td>);
                })}</tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
