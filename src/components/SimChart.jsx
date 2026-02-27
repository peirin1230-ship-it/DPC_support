import { useMemo } from "react";
import { M } from "../styles";
import useModal from "../useModal";

// 期間I=青, II=緑, III=オレンジ
const P_CLR = ["#3B82F6", "#10B981", "#F59E0B"];

// 階段状のパス（塗りつぶし用・閉じたパス）を生成するヘルパー
// days=[d1,d2,d3], points=[p1,p2,p3] から「点/日」のステップ形状を作る
export function buildStepPath(days, points, xFn, yFn, y0) {
  const [d1, d2, d3] = days;
  const [p1, p2, p3] = points;
  const segs = [];
  if (d1 && p1) segs.push({ x0: 0, x1: d1, y: p1, pi: 0 });
  if (d2 && p2) segs.push({ x0: d1 || 0, x1: d2, y: p2, pi: 1 });
  if (d3 && p3) segs.push({ x0: d2 || 0, x1: d3, y: p3, pi: 2 });
  if (segs.length === 0) return { fill: "", line: "", segs: [] };

  // 塗りつぶし用パス（閉じる）
  let fill = `M${xFn(0)},${y0}`;
  for (const s of segs) fill += ` L${xFn(s.x0)},${yFn(s.y)} L${xFn(s.x1)},${yFn(s.y)}`;
  fill += ` L${xFn(segs[segs.length - 1].x1)},${y0} Z`;

  // 線のパス
  let line = `M${xFn(0)},${yFn(segs[0].y)}`;
  for (const s of segs) line += ` L${xFn(s.x0)},${yFn(s.y)} L${xFn(s.x1)},${yFn(s.y)}`;

  return { fill, line, segs };
}

export default function SimChart({ r, sd, onClose }) {
  const modalRef=useModal(onClose);
  const [d1, d2, d3] = r.days;
  const [p1, p2, p3] = r.points;

  const maxDay = useMemo(() => {
    const base = d3 || d2 || d1 || 30;
    return sd > 0 ? Math.max(base + 3, sd + 2) : base + 5;
  }, [d1, d2, d3, sd]);

  const maxPts = Math.max(p1 || 0, p2 || 0, p3 || 0, 1);

  // レイアウト
  const W = 560, H = 220, PL = 52, PR = 16, PT = 16, PB = 32;
  const cW = W - PL - PR, cH = H - PT - PB;
  const xFn = d => PL + (d / maxDay) * cW;
  const yFn = v => PT + cH - (v / maxPts) * cH;
  const y0 = PT + cH;

  const { fill, line, segs } = buildStepPath(r.days, r.points, xFn, yFn, y0);

  // Y軸目盛り（3本程度）
  const yStep = Math.max(1, Math.ceil(maxPts / 3 / 100) * 100);
  const yTicks = [];
  for (let v = 0; v <= maxPts; v += yStep) yTicks.push(v);
  if (yTicks[yTicks.length - 1] < maxPts) yTicks.push(maxPts);

  // 期間サマリー
  const periods = [];
  if (d1 && p1) periods.push({ label: "I", d: `${d1}日`, pts: p1, total: d1 * p1, color: P_CLR[0] });
  if (d2 && p2) periods.push({ label: "II", d: `${(d1||0)+1}〜${d2}日`, pts: p2, total: ((d2||0)-(d1||0))*p2, color: P_CLR[1] });
  if (d3 && p3) periods.push({ label: "III", d: `${(d2||0)+1}〜${d3}日`, pts: p3, total: ((d3||0)-(d2||0))*p3, color: P_CLR[2] });
  // sd指定時の正確な合計
  const sdTotal = useMemo(() => {
    if (!sd || sd <= 0) return 0;
    let t = 0;
    for (let d = 1; d <= sd; d++) {
      if (d <= (d1||0)) t += (p1||0);
      else if (d <= (d2||0)) t += (p2||0);
      else if (d <= (d3||0)) t += (p3||0);
    }
    return t;
  }, [sd, d1, d2, d3, p1, p2, p3]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={`${r.code} 点数推移グラフ`} style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #E0E0E0",
        boxShadow: "0 16px 48px rgba(0,0,0,.12)",
        width: 600, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E0E0E0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3B82F6", fontFamily: M, fontSize: 15, fontWeight: 700 }}>{r.code}</span>
            <span style={{ color: "#737373", fontSize: 13 }}>点数推移</span>
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{ background: "#F5F5F5", border: "none", color: "#737373", cursor: "pointer", width: 28, height: 28, borderRadius: 6, fontSize: 13, transition: "background .15s" }}
            onMouseEnter={e=>e.currentTarget.style.background="#E8E8E8"} onMouseLeave={e=>e.currentTarget.style.background="#F5F5F5"}>✕</button>
        </div>

        {/* グラフ */}
        <div style={{ padding: "12px 16px 4px" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label={`${r.code} 点数推移グラフ: ${periods.map(p=>`期間${p.label} ${p.pts}点/日`).join(", ")}${sd>0?`, ${sd}日入院 総${sdTotal.toLocaleString()}点`:""}`}>
            {/* Y軸目盛り */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yFn(v)} x2={W - PR} y2={yFn(v)} stroke="#E0E0E0" strokeWidth="0.5" />
                <text x={PL - 6} y={yFn(v) + 4} textAnchor="end" fill="#737373" fontSize="9" fontFamily={M}>{v.toLocaleString()}</text>
              </g>
            ))}

            {/* 塗りつぶし */}
            <path d={fill} fill="url(#stepGrad)" />
            <defs>
              <linearGradient id="stepGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* ステップ線 — 各期間ごとに色分け */}
            {segs.map((s, i) => (
              <g key={i}>
                <line x1={xFn(s.x0)} y1={yFn(s.y)} x2={xFn(s.x1)} y2={yFn(s.y)}
                  stroke={P_CLR[s.pi]} strokeWidth="2.5" />
                {/* 段差（縦線） */}
                {i > 0 && <line x1={xFn(s.x0)} y1={yFn(segs[i-1].y)} x2={xFn(s.x0)} y2={yFn(s.y)}
                  stroke="#A6A6A6" strokeWidth="1" strokeDasharray="3 2" />}
              </g>
            ))}

            {/* 期間境界ラベル + 縦点線 */}
            {[d1, d2, d3].filter(Boolean).map((dv, i) => (
              <g key={i}>
                <line x1={xFn(dv)} y1={PT} x2={xFn(dv)} y2={y0} stroke="#D4D4D4" strokeWidth="1" strokeDasharray="4 3" />
                <text x={xFn(dv)} y={y0 + 14} textAnchor="middle" fill="#737373" fontSize="9" fontFamily={M}>{dv}日</text>
              </g>
            ))}

            {/* 各期間の点数ラベル（線の右端に表示） */}
            {segs.map((s, i) => (
              <text key={i} x={xFn(s.x1) - 4} y={yFn(s.y) - 6} textAnchor="end" fill={P_CLR[s.pi]} fontSize="11" fontWeight="700" fontFamily={M}>
                {s.y.toLocaleString()}
              </text>
            ))}

            {/* 入院日数マーカー */}
            {sd > 0 && sd <= maxDay && (
              <g>
                <line x1={xFn(sd)} y1={PT} x2={xFn(sd)} y2={y0} stroke="#EF4444" strokeWidth="2" />
                <rect x={xFn(sd) - 16} y={PT - 2} width="32" height="14" rx="3" fill="#EF4444" />
                <text x={xFn(sd)} y={PT + 9} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{sd}日</text>
              </g>
            )}

            {/* X軸ベースライン */}
            <line x1={PL} y1={y0} x2={W - PR} y2={y0} stroke="#D4D4D4" strokeWidth="1" />
          </svg>
        </div>

        {/* 期間サマリー */}
        <div style={{ padding: "4px 20px 16px" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {periods.map((p, i) => (
              <div key={i} style={{ flex: 1, background: "#FAFAFA", borderRadius: 6, padding: "8px 10px", borderLeft: `3px solid ${p.color}` }}>
                <div style={{ fontSize: 11, color: "#737373" }}>期間{p.label}（{p.d}）</div>
                <div style={{ fontFamily: M, color: p.color, fontWeight: 700, fontSize: 16 }}>{p.pts.toLocaleString()}<span style={{ fontSize: 10, color: "#737373", fontWeight: 400 }}> 点/日</span></div>
                <div style={{ fontFamily: M, color: "#737373", fontSize: 12 }}>小計 {p.total.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {sd > 0 && (
            <div style={{ marginTop: 8, background: "#FAFAFA", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#737373", fontSize: 13 }}>{sd}日入院の総点数{sd > (d3||0) ? <span style={{ color: "#EF4444" }}>（{sd-(d3||0)}日は出来高）</span> : ""}</span>
              <span style={{ fontFamily: M, color: "#F59E0B", fontWeight: 700, fontSize: 18 }}>{sdTotal.toLocaleString()} 点</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
