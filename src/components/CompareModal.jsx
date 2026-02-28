import { M } from "../styles";
import { calcTotal } from "../utils";
import { buildStepPath } from "./SimChart";
import useModal from "../useModal";

// 点数順位に基づく色: 最高=赤, 最低=青, それ以外=グレー
const CLR_HIGH = "#C0392B"; // 赤（最高点数）
const CLR_LOW  = "#4B7BB5"; // 青（最低点数）
const CLR_DEF  = "#9CA3AF"; // グレー（中間）

// 総点数の順位に基づいて各アイテムに色を割り当てる
function assignColors(tots) {
  const n = tots.length;
  if (n < 2) return [CLR_HIGH];
  const ranked = tots.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t);
  const colors = new Array(n).fill(CLR_DEF);
  colors[ranked[0].i] = CLR_HIGH; // 最高→赤
  colors[ranked[n - 1].i] = CLR_LOW; // 最低→青
  return colors;
}

// 比較チャート — 複数DPCの点数推移を重ねて表示
function CompareChart({ items, sd, colors }) {
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

  // 各DPCのステップパスを計算（色は親から渡された順位ベース色を使用）
  const paths = nonDk.map((r, i) => {
    const origIdx = items.indexOf(r);
    const lastDay = r.days[2] || r.days[1] || r.days[0] || 0;
    return {
      ...buildStepPath(r.days, r.points, xFn, yFn, y0),
      color: colors[origIdx] || CLR_DEF,
      code: r.code,
      days: r.days,
      points: r.points,
      lastDay
    };
  });

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

        {/* 出来高ゾーン — DPC期間IIIを超える部分を薄い背景で表示 */}
        {sd > 0 && paths.map((p, pi) => {
          if (p.lastDay <= 0 || sd <= p.lastDay) return null;
          return (
            <g key={`dk${pi}`}>
              <rect x={xFn(p.lastDay)} y={PT} width={xFn(Math.min(sd, maxDay)) - xFn(p.lastDay)} height={cH}
                fill={p.color} opacity="0.06" stroke={p.color} strokeWidth="0.5" strokeDasharray="4 3" />
              <text x={(xFn(p.lastDay) + xFn(Math.min(sd, maxDay))) / 2} y={PT + 12 + pi * 14}
                textAnchor="middle" fill={p.color} fontSize="8" opacity="0.7">出来高</text>
            </g>
          );
        })}

        {/* 各DPCのステップ線 + 段差の縦線 + 境界ドット */}
        {paths.map((p, pi) => (
          <g key={`g${pi}`}>
            {p.segs.map((s, j) => (
              <g key={j}>
                {/* 水平線 */}
                <line x1={xFn(s.x0)} y1={yFn(s.y)} x2={xFn(s.x1)} y2={yFn(s.y)}
                  stroke={p.color} strokeWidth="2" strokeLinecap="round" />
                {/* 段差の縦点線 */}
                {j > 0 && <line x1={xFn(s.x0)} y1={yFn(p.segs[j-1].y)} x2={xFn(s.x0)} y2={yFn(s.y)}
                  stroke={p.color} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />}
                {/* 境界ドット */}
                <circle cx={xFn(s.x0)} cy={yFn(s.y)} r="2.5" fill={p.color} />
                {j === p.segs.length - 1 && <circle cx={xFn(s.x1)} cy={yFn(s.y)} r="2.5" fill={p.color} />}
              </g>
            ))}
          </g>
        ))}

        {/* 点数値ラベル — 重なり回避のため全パス分をまとめて配置 */}
        {(() => {
          // 全ラベル候補を集める
          const labels = [];
          paths.forEach((p, pi) => {
            p.segs.forEach((s, j) => {
              const mx = (xFn(s.x0) + xFn(s.x1)) / 2;
              labels.push({ x: mx, baseY: yFn(s.y), val: s.y, color: p.color, pi, j });
            });
          });
          // Y座標でソートし、近いラベル同士をずらす
          labels.sort((a, b) => a.baseY - b.baseY);
          const placed = [];
          const LH = 12; // ラベル高さ
          labels.forEach(lb => {
            let ty = lb.baseY - 8;
            for (let attempt = 0; attempt < 6; attempt++) {
              const overlap = placed.some(p => Math.abs(p.x - lb.x) < 40 && Math.abs(p.y - ty) < LH);
              if (!overlap) break;
              ty -= LH;
            }
            placed.push({ x: lb.x, y: ty });
            lb.finalY = ty;
          });
          return labels.map((lb, i) => (
            <text key={`lb${i}`} x={lb.x} y={lb.finalY} textAnchor="middle"
              fill={lb.color} fontSize="10" fontWeight="700" fontFamily={M}>
              {lb.val.toLocaleString()}
            </text>
          ));
        })()}

        {/* 入院日数マーカー */}
        {sd > 0 && sd <= maxDay && (
          <g>
            <line x1={xFn(sd)} y1={PT} x2={xFn(sd)} y2={y0} stroke="#C0392B" strokeWidth="2" />
            <rect x={xFn(sd) - 16} y={PT - 4} width="32" height="14" rx="3" fill="#C0392B" />
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
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={p.color} strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="5" r="2.5" fill={p.color} /></svg>
            <span style={{ color: p.color, fontFamily: M, fontWeight: 700, fontSize: 12 }}>{p.code}</span>
          </div>
        ))}
        {sd > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="10"><line x1="12" y1="0" x2="12" y2="10" stroke="#C0392B" strokeWidth="2" /></svg>
            <span style={{ color: "#C0392B", fontSize: 11 }}>{sd}日入院</span>
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
  const colors=assignColors(tots);
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
          <button onClick={onClose} aria-label="閉じる" style={{background:"#F5F5F5",border:"none",color:"#737373",cursor:"pointer",width:40,height:40,borderRadius:8,transition:"background .15s",display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background="#E8E8E8"} onMouseLeave={e=>e.currentTarget.style.background="#F5F5F5"}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg></button>
        </div>

        {/* 比較チャート */}
        <CompareChart items={items} sd={sd} colors={colors} />

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <caption style={{textAlign:"left",fontSize:12,color:"#737373",padding:"0 0 6px",fontWeight:600}}>DPC比較表{sd?`（${sd}日入院）`:""}</caption>
          <thead>
            <tr>
              <th scope="col" style={{padding:"6px 10px",background:"#FAFAFA",color:"#737373",fontWeight:600,borderBottom:"1px solid #E0E0E0",fontSize:12,whiteSpace:"nowrap",textAlign:"left"}}>DPC</th>
              {items.map((it,ii)=>{const c=colors[ii];return(
                <th key={ii} scope="col" style={{padding:"6px 10px",borderBottom:"1px solid #E0E0E0",color:c,fontWeight:700,fontFamily:M,textAlign:"left"}}>
                  <span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:c,marginRight:6,verticalAlign:"middle"}}/>{it.code}
                </th>
              );})}
            </tr>
          </thead>
          <tbody>
            {fields.filter(([lb])=>lb!=="DPC").map(([lb,fn,mono,cmp],fi)=>{
              const vs=items.map(fn);const same=vs.every(v=>v===vs[0]);
              const ni=numInfo[fi+1];
              // 行内の差異情報を事前計算
              const di=(()=>{if(same)return null;const cnt=new Map();vs.forEach(x=>cnt.set(x,(cnt.get(x)||0)+1));const mx=Math.max(...cnt.values());return{cnt,mx,maj:mx>vs.length/2};})();
              return(<tr key={lb}>
                <th scope="row" style={{padding:"6px 10px",background:"#FAFAFA",color:"#737373",fontWeight:600,borderBottom:"1px solid #E0E0E0",fontSize:12,whiteSpace:"nowrap",textAlign:"left"}}>{lb}</th>
                {items.map((it,ii)=>{
                  const v=fn(it);const dk=lb==="区分"&&v==="出来高";const diff=!same;
                  // 明確な多数派がある場合は少数派のみ、なければ全セルをハイライト（期間・点数行は除外）
                  const cellDiff=!cmp&&di&&(di.maj?di.cnt.get(v)<di.mx:true);
                  const c=colors[ii];const isHL=c===CLR_HIGH||c===CLR_LOW;
                  let cellColor=dk?"#C0392B":(cmp&&isHL)?c:isHL?"#404040":"#737373";
                  let cellBg=cellDiff?"rgba(251,191,36,.12)":(cmp&&isHL)?`${c}0F`:"transparent";
                  const dispVal=cmp?(v>0?(lb.startsWith("期間")?v+"日":v.toLocaleString()):"-"):v;
                  return(<td key={ii} style={{padding:"6px 10px",borderBottom:"1px solid #E0E0E0",color:cellColor,fontWeight:dk||(cmp&&isHL)?700:diff?600:400,fontFamily:mono?M:"inherit",background:cellBg}}>{dispVal}</td>);
                })}
              </tr>);
            })}
            {sd>0&&(<>
              {(()=>{const hasDk=items.some(it=>{const ld=it.days[2]||it.days[1]||it.days[0]||0;return !it.isDekidaka&&sd>ld;});return(<>
              <tr><th scope="row" style={{padding:"8px 10px",background:"#FAFAFA",color:"#404040",fontWeight:700,borderBottom:"1px solid #E0E0E0",fontSize:13,textAlign:"left"}}>
                総点数{hasDk&&<span style={{fontSize:10,fontWeight:400,color:"#C0392B",marginLeft:4}}>※DPC包括分のみ</span>}
              </th>
                {items.map((it,ii)=>{
                  const t=tots[ii];const c=colors[ii];const isHL=c===CLR_HIGH||c===CLR_LOW;
                  const ld=it.days[2]||it.days[1]||it.days[0]||0;
                  const isOver=!it.isDekidaka&&sd>ld;
                  return(<td key={ii} style={{padding:"8px 10px",borderBottom:"1px solid #E0E0E0",color:it.isDekidaka?"#C0392B":isHL?c:"#737373",fontWeight:700,fontFamily:M,fontSize:16,background:isHL?`${c}0F`:"#FAFAFA"}}>
                    {it.isDekidaka?"出来高":(t?t.toLocaleString():"-")}
                    {c===CLR_HIGH&&!it.isDekidaka&&<span style={{fontSize:10,fontWeight:400,marginLeft:4}}>（最高）</span>}
                    {c===CLR_LOW&&!it.isDekidaka&&<span style={{fontSize:10,fontWeight:400,marginLeft:4}}>（最低）</span>}
                    {isOver&&<span style={{display:"block",fontSize:10,fontWeight:400,color:"#C0392B",marginTop:2}}>+出来高{sd-ld}日分</span>}
                  </td>);
                })}</tr>
              {hasDk&&(
                <tr><th scope="row" style={{padding:"6px 10px",background:"#FAFAFA",color:"#C0392B",fontWeight:600,borderBottom:"1px solid #E0E0E0",fontSize:12,textAlign:"left"}}>出来高日数</th>
                  {items.map((it,ii)=>{
                    const ld=it.days[2]||it.days[1]||it.days[0]||0;
                    const over=it.isDekidaka?0:Math.max(0,sd-ld);
                    return(<td key={ii} style={{padding:"6px 10px",borderBottom:"1px solid #E0E0E0",color:over>0?"#C0392B":"#737373",fontWeight:over>0?700:400,fontFamily:M,fontSize:13,background:over>0?"rgba(192,57,43,.04)":"transparent"}}>{over>0?`${over}日（${ld+1}〜${sd}日）`:"-"}</td>);
                  })}</tr>
              )}
              </>);})()}
            </>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
