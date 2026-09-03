import { D } from "./data.js";

/* ──────────────────────────────────────────────────────────
 * DPC電子点数表データ（D）に対する検索・計算ロジック
 *
 * D.dpc[code] = [MDC, 分類4桁, 包括フラグ("1"=包括/"0"=出来高),
 *                手術区分(9-10桁目), 処置等1(11桁目), 処置等2(12桁目), 副傷病(13桁目),
 *                期間Ⅰ日数, 期間Ⅱ日数, 期間Ⅲ日数, 期間Ⅰ点数, 期間Ⅱ点数, 期間Ⅲ点数]
 * 手術区分〜副傷病はDPCコードの桁そのもので、"x"/"xx" は「その分岐が無い」ことを表す。
 * 定義テーブル（D.p1/D.p2/D.sd）は電子点数表の「対応コード」でキー付けされ、変換テーブルで
 * 複数の対応コードが同じ桁に縮約される分類は D.cv[cls][手術区分][種別][対応コード] = 桁 で表す。
 * ────────────────────────────────────────────────────────── */

export const X = "x";
export const ICD_M_WILDCARD = "M!!!!"; // ＩＣＤテーブルにないＭコードは 071030 に該当
export const CODE_NO_SURGERY = "KKK0";
export const CODE_OTHER_SURGERY = "KKK1";

export const MDC_NAMES = { "01": "神経系", "02": "眼科系", "03": "耳鼻咽喉科系", "04": "呼吸器系", "05": "循環器系", "06": "消化器系", "07": "筋骨格系", "08": "皮膚・皮下組織", "09": "乳房", "10": "内分泌・代謝", "11": "腎・泌尿器", "12": "女性生殖器・産褥", "13": "血液・免疫", "14": "新生児・先天性", "15": "小児", "16": "外傷・中毒", "17": "精神", "18": "その他" };

/* ── 文字列正規化 ── */
export function normalize(s) {
  return String(s ?? "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase()
    .replace(/[\s　]+/g, "");
}
const dh = (s) => s.replace(/-/g, "");
export function cleanName(n) {
  return String(n ?? "").replace(/（([^）])）/g, "$1").replace(/＜([^＞]+)＞/g, "");
}

/* ── 分岐値ヘルパー ── */
export const isNA = (v) => v === undefined || v === null || v === "" || v === "x" || v === "xx" || v === "X";
/** 相関値を数値化（base36: 1〜9, A=10, B=11 …）。分岐なし(x)は -1 */
export function corrNum(v) {
  if (isNA(v)) return -1;
  const n = parseInt(v, 36);
  return Number.isNaN(n) ? 0 : n;
}
/** 実際の分岐値が条件に合うか（分岐なし(x)は常に合致） */
export function matchVal(actual, wanted) {
  return wanted === undefined || wanted === null || isNA(actual) || actual === wanted;
}
/** 定義テーブルの対応コード → DPCコードの桁（変換テーブルの縮約を反映。写像が無ければそのまま） */
export function corrToDigit(cls, sv, type, corr) {
  if (corr === undefined || corr === null) return corr;
  return D.cv?.[cls]?.[sv]?.[type]?.[corr] ?? corr;
}
/** リストにコードそのものが含まれるか（"K1+K2" の組み合わせは組み合わせとして選択された場合のみ一致） */
export function slHasExact(list, code) {
  return !!list && !!code && list.includes(code);
}
/** リストにコードが含まれるか（"K1+K2" の構成要素としての一致も含む。候補提示・ヒント用） */
export function slHas(list, code) {
  if (!list || !code) return false;
  return list.some((e) => e === code || (e.includes("+") && e.split("+").includes(code)));
}
/** リスト中で code を構成要素に含む組み合わせ手術 */
export function combosContaining(list, code) {
  if (!list || !code) return [];
  return list.filter((e) => e.includes("+") && e !== code && e.split("+").includes(code));
}

/* ── 通知に基づく特別扱い ── */
// 保医発0321第6号 第2の3(8): 「手術」とは第10部に掲げる手術（手術等管理料及び輸血管理料を除く。）
const NON_SURGERY_RE = /^K91[4-7]|^K920-2/;
export function isNonSurgeryCode(k) { return !!k && NON_SURGERY_RE.test(normalize(k)); }
export const NON_SURGERY_NOTE = "手術等管理料・輸血管理料は診断群分類上の「手術」に含まれないため、手術なし（99）として検索しています（保医発0321第6号 第2の3(8)）。";

// 通知 第2の1(2): C97・T14.0〜T14.9 は選択せず主たる部位のICD-10を選択する。
// コーディングテキスト p.22: T08・T10・T12（部位不明の損傷）は留意して使用する。
export function icdWarning(code) {
  const q = normalize(code || "").replace(/\$$/, "");
  if (!q) return null;
  if (q === "C97" || /^T14\d?$/.test(q)) {
    return { level: "forbid", tag: "選択不可", text: `${q} は診断群分類区分の決定に用いないICD-10です。主たる部位のICD-10を選択してください（保医発0321第6号 第2の1(2)）。` };
  }
  if (/^T(08|10|12)\d?$/.test(q)) {
    return { level: "caution", tag: "留意", text: `${q}（部位不明の損傷）は部位を明確にして他のICD-10を選択できないか確認してください（コーディングテキスト 留意コード）。` };
  }
  return null;
}

export const COEFFICIENT_NOTE = "表示の点数は診断群分類点数表の点数（医療機関別係数・加算・出来高部分を含まない）です。";
export const SUBDIAG_NOTE = "定義副傷病は入院時併存症と入院後発症傷病の両方を含み、疑い病名は除きます（保医発0321第6号 第2の2(2)）。";

// 重症度等・年齢等の判定時点と「不明」時の扱い（保医発0321第6号 第2の3）
const SEV_NOTES = [
  [/ＪＣＳ|JCS/, "ＪＣＳは入院時（入院後に発症した傷病が医療資源病名となる場合は発症時）で判断します（通知 第2の3(1)）。"],
  [/膵炎|軽症|重症/, "重症度が判定できない「不明」の場合は「軽症」を選択します（通知 第2の3(12)）。"],
  [/発症時期/, "発症時期は診断群分類区分の適用開始時を起点とし、適用開始後に発症した場合は「発症3日目以内」を選択します（通知 第2の3(14)）。"],
  [/A-DROP|ＡＤＲＯＰ/i, "A-DROPスコアは入院時（入院中に発生した場合は発症時）の5項目（男性70歳以上・女性75歳以上／BUN 21mg/dL以上又は脱水／SpO2 90%以下／意識障害／収縮期血圧90mmHg以下）の合計数です（通知 第2の3(15)）。"],
  [/Child|Ｃｈｉｌｄ/, "Child-Pugh分類は一入院期間で最も重症度が高い時点の状態で判定し、判定できない項目は1点として計上します（通知 第2の3(20)）。"],
  [/年齢/, "年齢は診断群分類区分が適用される入院時の年齢です（通知 第2の3(3)）。"],
];
export function severityNote(name) {
  const n = String(name || "");
  for (const [re, note] of SEV_NOTES) if (re.test(n)) return note;
  return "";
}
const COND_NOTES = {
  "120170": "妊娠週数は入院時の週数で、不明の場合等は「34週以上」を選択します（通知 第2の3(16)）。",
  "120260": "分娩時出血量が不明の場合、又は入院周辺の分娩の有無が「その他」の場合は「2000ml未満」を選択します（通知 第2の3(19)）。",
  "040080": "年齢は入院時の年齢。市中肺炎の区分と年齢の両方を満たす条件を選択します（通知 第2の3(3)(15)）。",
};
export function conditionNote(cls) { return COND_NOTES[cls] || ""; }

/* ── 分類別DPCインデックス（遅延生成） ── */
let _byCls = null;
export function dpcByCls() {
  if (!_byCls) {
    _byCls = new Map();
    for (const [code, info] of Object.entries(D.dpc)) {
      const cls = info[0] + info[1];
      let arr = _byCls.get(cls);
      if (!arr) _byCls.set(cls, (arr = []));
      arr.push(code);
    }
  }
  return _byCls;
}
export function dpcCodesOf(cls) { return dpcByCls().get(cls) || []; }
/** 分類で実際に使われている手術区分の集合 */
export function classSurgVals(cls) {
  return new Set(dpcCodesOf(cls).map((c) => c.slice(8, 10)));
}

/* ── ラベル ── */
/** 分岐ラベル。手術区分別の例外ラベル（D.lb[cls]["1:02"] 等）があれば優先 */
export function getLabel(c, t, v, sv) {
  if (isNA(v)) return "";
  const lb = D.lb[c];
  if (!lb) return v || "";
  if (sv && lb[`${t}:${sv}`]?.[v]) return lb[`${t}:${sv}`][v];
  return lb[t]?.[v] || v || "";
}
export function hasBranch(c, s, t) { return !!D.br[c]?.[s]?.[t]; }

/* ── ICD → 分類 ── */
export function findCls(icd) {
  if (!icd) return [];
  const q = normalize(icd);
  // 分類コード6桁（例: 010010, 01021x）が直接指定された場合
  if (q.length === 6 && /^\d{2}[0-9X]{4}$/.test(q) && D.cls[q.toLowerCase()]) return [q.toLowerCase()];
  const r = [];
  for (const [c, codes] of Object.entries(D.icd)) {
    for (const code of codes) {
      if (code === ICD_M_WILDCARD) continue;
      if (code.endsWith("$")) {
        if (q.startsWith(code.slice(0, -1))) { r.push(c); break; }
      } else if (code === q) { r.push(c); break; }
    }
  }
  // ＩＣＤテーブルにないＭコードは「M!!!!」を持つ分類（071030）に該当する
  if (!r.length && q.startsWith("M")) {
    for (const [c, codes] of Object.entries(D.icd)) if (codes.includes(ICD_M_WILDCARD)) r.push(c);
  }
  return r;
}

/* ── 副傷病 ── */
/**
 * 定義副傷病の対象ICD一覧。
 * surgVal を渡すと、副傷病フラグ（共通/手術なしのみ/手術ありのみ）に応じて絞り込む。
 */
export function getSubdiagICDs(cls, sdVal, surgVal) {
  if (isNA(sdVal) || sdVal === "0" || sdVal === 0) return [];
  const raw = D.sd?.[cls]?.[sdVal];
  if (!raw) return [];
  const e = Array.isArray(raw) ? { a: raw } : raw;
  const out = [], seen = new Set();
  for (const [scope, codes] of [["a", e.a], ["n", e.n], ["s", e.s]]) {
    if (!codes) continue;
    if (surgVal !== undefined && !isNA(surgVal)) {
      if (scope === "n" && surgVal !== "99") continue;
      if (scope === "s" && surgVal === "99") continue;
    }
    for (const c of codes) {
      if (seen.has(c)) continue;
      seen.add(c);
      const isPrefix = c.endsWith("$");
      const base = isPrefix ? c.slice(0, -1) : c;
      out.push({ code: base, isPrefix, name: cleanName(D.icn[c] || D.icn[base] || ""), scope });
    }
  }
  return out;
}

/* ── 重症度・条件 ── */
export function getSevInfo(cls, dpc) {
  const sv = D.sv?.[cls];
  if (!sv || !dpc || dpc.length !== 14) return null;
  const p = dpc[13];
  if (p === "x" || p === "X") return null;
  return { name: sv.name || "", value: p, label: sv[p] || "" };
}
export function getCondLabel(cls, dpc) {
  if (!dpc || dpc.length < 8) return "";
  const pos78 = dpc.slice(6, 8);
  if (pos78 === "xx") return "";
  return D.pt?.[cls]?.[pos78] || "";
}

/* ── 点数計算 ── */
/**
 * 入院日数 sd に対する包括点数（医療機関別係数・加算は含まない）。
 * 期間Ⅲを超える日数は overDays（出来高）として返す。
 * 返り値: {total, overDays, d3, segments:[{days,pts}×3]} / 計算不能なら null
 */
export function calcTotal(days, pts, sd) {
  sd = Number(sd);
  if (!sd || sd <= 0) return null;
  const [d1 = 0, d2 = 0, d3 = 0] = days || [];
  const [p1 = 0, p2 = 0, p3 = 0] = pts || [];
  if (!d3 || !p1) return null;
  const n1 = Math.max(0, Math.min(sd, d1));
  const n2 = Math.max(0, Math.min(sd, d2) - d1);
  const n3 = Math.max(0, Math.min(sd, d3) - Math.max(d1, d2));
  const total = n1 * p1 + n2 * p2 + n3 * p3;
  return { total, overDays: Math.max(0, sd - d3), d3, segments: [{ days: n1, pts: p1 }, { days: n2, pts: p2 }, { days: n3, pts: p3 }] };
}
export function totalVal(days, pts, sd) { const r = calcTotal(days, pts, sd); return r ? r.total : 0; }

/* ── 出来高算定手術・薬剤 ── */
export function isDekidakaOp(kCode) {
  if (!kCode) return false;
  const parts = kCode.includes("+") ? kCode.split("+") : [kCode];
  for (const p of parts) {
    if (D.dk?.[p]) return true;
    const kd = dh(p);
    for (const k of Object.keys(D.dk || {})) if (dh(k) === kd) return true;
  }
  return false;
}
/** 出来高算定（包括対象外）の一覧: コード付き（手術・検査）と、薬剤・対象患者の文言 */
export function getDekidakaList() {
  const codes = Object.entries(D.dk || {}).map(([code, name]) => ({ code, name, kind: code.startsWith("K") ? "手術" : code.startsWith("D") ? "検査" : "その他" }));
  return { codes, drugs: D.dx?.dr || [], patients: D.dx?.pt || [] };
}
let _dkDrugNames = null;
/**
 * 処置等2の薬剤コードが「厚生労働大臣が定める出来高算定薬剤」（D.dx.dr）の一般名と一致するか。
 * 一致しても効能・用法等の条件付きのため「可能性」として表示する。
 */
export function isDekidakaDrug(code) {
  if (!_dkDrugNames) _dkDrugNames = (D.dx?.dr || []).map((t) => normalize(t));
  const name = normalize(D.cn?.[code] || "");
  if (!name || !/^\d{4}$/.test(code)) return false;
  return _dkDrugNames.some((t) => t.startsWith(name));
}

/* ── 結果オブジェクト ── */
function toResult(code, info) {
  const cls = info[0] + info[1];
  const sv = info[3], p1 = info[4], p2 = info[5], sdv = info[6];
  return {
    code, cls, clsName: D.cls[cls] || "",
    surgVal: sv, p1Val: p1, p2Val: p2, sdVal: sdv,
    hasSurgBranch: !isNA(sv), hasP1Branch: !isNA(p1), hasP2Branch: !isNA(p2), hasSdBranch: !isNA(sdv),
    surgeryName: isNA(sv) ? "" : getLabel(cls, "o", sv),
    proc1Name: isNA(p1) ? "-" : getLabel(cls, "1", p1, sv),
    proc2Name: isNA(p2) ? "-" : getLabel(cls, "2", p2, sv),
    subdiagName: isNA(sdv) ? "-" : getLabel(cls, "s", sdv, sv),
    severity: getSevInfo(cls, code),
    condLabel: getCondLabel(cls, code),
    pos78: code.slice(6, 8),
    days: [info[7], info[8], info[9]], points: [info[10], info[11], info[12]],
    isDekidaka: info[2] === "0" || info[2] === 0,
    ccpm: D.cc?.[code] || "",
  };
}
export function buildResultFromCode(code) {
  const info = D.dpc[code];
  return info ? toResult(code, info) : null;
}
/** 分類の全DPCを結果オブジェクトで返す */
export function resultsOfClass(cls) {
  return dpcCodesOf(cls).map((code) => toResult(code, D.dpc[code]));
}
/** サジェストの手術ステップで用いる選択キー（選択肢と行で同じ関数を使う） */
export const NO_SURG_BRANCH_LABEL = "手術による分岐なし";
export function surgKey(r) {
  return `${r.surgVal}::${isNA(r.surgVal) ? NO_SURG_BRANCH_LABEL : r.surgeryName || "なし"}`;
}

/* ── 処置等・薬剤の制約（分類ごとの対応コード） ── */
/**
 * 処置等コード・薬剤コードから、分類ごとの処置等1/2の対応コード制約を求める。
 * 同じ分岐に複数の該当があれば相関値の大きい方（ツリー図で下＝高優先）を採る。
 * 返り値: { cons: Map(cls → {p1?, p2?}), procFound: Set, drugFound: Set }
 */
export function procConstraints({ procAnyCode, drugCode } = {}, clsFilter) {
  const cons = new Map(), procFound = new Set(), drugFound = new Set();
  const add = (table, key, code, found) => {
    for (const [c, grp] of Object.entries(table)) {
      if (clsFilter && !clsFilter(c)) continue;
      let best = null;
      for (const [corr, codes] of Object.entries(grp)) {
        if (!slHasExact(codes, code)) continue;
        if (best === null || corrNum(corr) > corrNum(best)) best = corr;
      }
      if (best === null) continue;
      let e = cons.get(c);
      if (!e) cons.set(c, (e = {}));
      if (e[key] === undefined || corrNum(best) > corrNum(e[key])) e[key] = best;
      found.add(c);
    }
  };
  if (procAnyCode) { add(D.p1, "p1", procAnyCode, procFound); add(D.p2, "p2", procAnyCode, procFound); }
  if (drugCode) add(D.p2, "p2", drugCode, drugFound);
  return { cons, procFound, drugFound };
}
/** DPC行が処置等制約（対応コード）に合うか。分岐なし(x)と縮約を考慮 */
function matchProc(cls, info, co) {
  if (!co) return true;
  if (!matchVal(info[4], corrToDigit(cls, info[3], "1", co.p1))) return false;
  if (!matchVal(info[5], corrToDigit(cls, info[3], "2", co.p2))) return false;
  return true;
}

/* ── 検索 ── */
/**
 * 条件に合致するDPCを返す。
 *  - icdCode: 分類を特定（M!!!!ルール含む）
 *  - surgeryCode: 手術区分を特定。定義テーブルの完全一致のみ（"K1+K2" は組み合わせとして選択された場合）。
 *    ICD指定時に定義テーブルにないKコードなら「その他の手術あり(97)」として扱い surgFallback=true、
 *    そのKコードを構成要素に含む組み合わせ手術があれば comboHint に列挙する。
 *    手術等管理料・輸血管理料は「手術なし(99)」として扱い surgExcluded=true。
 *  - procAnyCode / drugCode: 処置等1・2の対応コードを特定（複数該当は高優先＝相関値大）。
 *    指定していない側の分岐は制約しない（ドリルダウンで絞り込む）。
 */
export function searchDPC({ icdCode, surgeryCode, procAnyCode, drugCode }) {
  if (!icdCode && !surgeryCode && !procAnyCode && !drugCode) return [];
  let targetCls = null;
  if (icdCode) { targetCls = findCls(icdCode); if (!targetCls.length) return []; }
  const inTarget = (c) => !targetCls || targetCls.includes(c);
  const surgCons = new Map(); // cls → surg digit
  const fallbackCls = new Set(), comboHints = new Map();
  let surgExcluded = false;

  if (surgeryCode) {
    let code = surgeryCode;
    if (isNonSurgeryCode(code)) { code = CODE_NO_SURGERY; surgExcluded = true; }
    if (code === CODE_NO_SURGERY) {
      for (const c of targetCls || Object.keys(D.cls)) surgCons.set(c, "99");
    } else {
      for (const [c, si] of Object.entries(D.si)) {
        if (!inTarget(c)) continue;
        let picked = null;
        for (const [corr, idx] of Object.entries(si)) {
          if (!slHasExact(D.sl[idx], code)) continue;
          // 同一分類内で複数区分に一致する場合は高優先（相関値の小さい定義手術＝ツリー図の下）を採る
          if (picked === null || surgPriority(corr) > surgPriority(picked)) picked = corr;
        }
        if (picked !== null) surgCons.set(c, picked);
        const hints = Object.values(si).flatMap((idx) => combosContaining(D.sl[idx], code));
        if (hints.length) comboHints.set(c, [...new Set(hints)]);
      }
      if (targetCls) {
        for (const c of targetCls) {
          if (surgCons.has(c)) continue;
          const svs = classSurgVals(c);
          if (svs.has("xx")) surgCons.set(c, "xx"); // 手術による分岐なし
          else if (svs.has("97")) { surgCons.set(c, "97"); fallbackCls.add(c); }
        }
      }
    }
  }

  const { cons: pcons, procFound, drugFound } = procConstraints({ procAnyCode, drugCode }, (c) => inTarget(c) && (!surgeryCode || surgCons.has(c)));

  const candidates = targetCls || [...new Set([...surgCons.keys(), ...pcons.keys()])];
  const results = [];
  for (const cls of candidates) {
    if (surgeryCode && !surgCons.has(cls)) continue;
    if (procAnyCode && !procFound.has(cls)) continue;
    if (drugCode && !drugFound.has(cls)) continue;
    const surg = surgCons.get(cls);
    const co = pcons.get(cls);
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!matchVal(info[3], surg)) continue;
      if (!matchProc(cls, info, co)) continue;
      const r = toResult(code, info);
      if (fallbackCls.has(cls)) r.surgFallback = true;
      if (surgExcluded) r.surgExcluded = true;
      if (comboHints.has(cls)) r.comboHint = comboHints.get(cls);
      results.push(r);
    }
  }
  results.sort((a, b) => (b.points[0] || 0) - (a.points[0] || 0));
  return results;
}
/** 手術区分の優先度: 定義手術は番号が小さいほどツリー図の下＝高優先。97・99 は最下位 */
function surgPriority(sv) {
  if (sv === "99") return -2;
  if (sv === "97") return -1;
  const n = parseInt(sv, 10);
  return Number.isNaN(n) ? -3 : 100 - n;
}

export function searchDisease(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q);
  const r = [];
  for (const [c, n] of Object.entries(D.cls)) {
    if (normalize(n).includes(qn) || normalize(c).includes(qn)) {
      r.push({ code: c, name: n, tag: "分類" });
      if (r.length >= 5) break;
    }
  }
  for (const [c, n] of Object.entries(D.icn)) {
    const cn = normalize(c);
    const isP = c.endsWith("$");
    const base = isP ? cn.slice(0, -1) : cn;
    if (n.includes(q) || normalize(n).includes(qn) || cn.includes(qn) || (isP && qn.startsWith(base))) {
      const w = icdWarning(c);
      r.push({ code: c, name: cleanName(n), ...(w ? { tag: w.tag, warn: w.level } : {}) });
      if (r.length >= 30) break;
    }
  }
  return r;
}

/**
 * 手術Kコード・名称で検索。定義テーブルの手術（組み合わせ "K1+K2" は1件として）に加えて、
 * 出来高算定手術等コード（D.dk）、手術等管理料・輸血管理料（手術なし扱い）、
 * 定義テーブルにないKコードそのもの（その他の手術あり扱い）も候補に出す。
 */
export function searchSurg(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q), qd = dh(qn);
  const r = [], seen = new Set();
  for (const si of Object.values(D.si)) {
    for (const idx of Object.values(si)) {
      for (const kc of D.sl[idx] || []) {
        if (seen.has(kc)) continue;
        const parts = kc.split("+");
        const hit = parts.some((p) => dh(normalize(p)).includes(qd)) || normalize(D.cn[kc] || "").includes(qn);
        if (!hit) continue;
        r.push({ code: kc, name: D.cn[kc] || "", dk: isDekidakaOp(kc), ...(kc.includes("+") ? { tag: "組合せ" } : {}) });
        seen.add(kc);
        if (r.length >= 20) return r;
      }
    }
  }
  for (const [kc, name] of Object.entries(D.dk || {})) {
    if (!kc.startsWith("K") || seen.has(kc)) continue;
    if (dh(normalize(kc)).includes(qd) || normalize(name).includes(qn)) {
      r.push({ code: kc, name, dk: true, tag: "出来高" });
      seen.add(kc);
      if (r.length >= 20) return r;
    }
  }
  if (/^K\d{3}[\dA-Z\-ｲ-ﾝ]*$/.test(qn) && !r.some((x) => x.code === qn)) {
    if (isNonSurgeryCode(qn)) r.push({ code: qn, name: "手術等管理料・輸血管理料（手術なしとして検索）", tag: "99", free: true });
    else r.push({ code: qn, name: "定義テーブルにないKコード（その他の手術ありとして検索）", tag: "97", free: true });
  }
  return r;
}

export function searchProc(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q), qd = dh(qn);
  const r = [], seen = new Set();
  const scan = (table, tag) => {
    for (const grp of Object.values(table)) {
      for (const codes of Object.values(grp)) {
        for (const c of codes) {
          if (seen.has(c)) continue;
          const parts = c.split("+");
          if (parts.some((p) => dh(normalize(p)).includes(qd)) || normalize(D.cn[c] || "").includes(qn)) {
            r.push({ code: c, name: D.cn[c] || "", tag: c.includes("+") ? `${tag}・組合せ` : tag });
            seen.add(c);
            if (r.length >= 30) return true;
          }
        }
      }
    }
    return false;
  };
  if (scan(D.p1, "処置1")) return r;
  scan(D.p2, "処置2");
  return r;
}

export function searchDrug(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q);
  const r = [], seen = new Set();
  for (const grp of Object.values(D.p2)) {
    for (const codes of Object.values(grp)) {
      for (const c of codes) {
        if (seen.has(c) || !/^\d{4}$/.test(c)) continue;
        const n = D.cn[c] || "";
        const al = D.da?.[c] || [];
        let m = normalize(n).includes(qn) || c.includes(qn);
        let ma = "";
        if (!m) for (const a of al) { if (normalize(a).includes(qn)) { m = true; ma = a; break; } }
        if (!m) continue;
        const dn = ma ? `${n}（${ma}）` : al.length > 0 ? `${n}（${al[0]}）` : n;
        r.push({ code: c, name: dn, ...(isDekidakaDrug(c) ? { tag: "出来高薬剤の可能性", warn: "caution" } : {}) });
        seen.add(c);
        if (r.length >= 20) return r;
      }
    }
  }
  return r;
}

/* ── 該当なし時のヒント ── */
export function getNoResultHints({ surgeryCode, procAnyCode, drugCode }) {
  if (!procAnyCode && !drugCode) return null;
  const evalItems = [];
  const collect = (table, code, branch) => {
    for (const [cls, grp] of Object.entries(table)) {
      for (const codes of Object.values(grp)) {
        if (!slHas(codes, code)) continue;
        const br = D.br[cls];
        if (br) for (const [sv, b] of Object.entries(br)) {
          if (b[branch === "処置1" ? "1" : "2"]) evalItems.push({ cls, clsName: D.cls[cls] || "", surgVal: sv, surgName: getLabel(cls, "o", sv), branch });
        }
        break;
      }
    }
  };
  if (procAnyCode) { collect(D.p1, procAnyCode, "処置1"); collect(D.p2, procAnyCode, "処置2"); }
  if (drugCode) collect(D.p2, drugCode, "処置2");
  const code = procAnyCode || drugCode;
  return { code, name: D.cn[code] || "", evalItems };
}

/** 分類内で code が属する対応コード（複数該当は高優先＝相関値大） */
export function findCorrValForCls(cls, type, code) {
  const map = type === "p1" ? D.p1[cls] : D.p2[cls];
  if (!map) return null;
  let best = null;
  for (const [cv, codes] of Object.entries(map)) if (slHasExact(codes, code) && (best === null || corrNum(cv) > corrNum(best))) best = cv;
  return best;
}

/* ── 一覧検索: 全分岐展開 ── */
export function getExpandedResults(baseResults, searchParams) {
  const pairs = new Set();
  for (const r of baseResults) pairs.add(`${r.cls}_${r.surgVal}`);
  const hasProc = !!(searchParams && (searchParams.procAnyCode || searchParams.drugCode));
  const clsSet = new Set([...pairs].map((p) => p.slice(0, 6)));
  const pcons = hasProc ? procConstraints(searchParams, (c) => clsSet.has(c)).cons : null;
  const expanded = [];
  for (const cls of clsSet) {
    const co = pcons ? pcons.get(cls) : null;
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!pairs.has(`${cls}_${info[3]}`)) continue;
      if (!matchProc(cls, info, co)) continue;
      expanded.push(toResult(code, info));
    }
  }
  return expanded;
}

/* ── サジェスト: 候補展開 ── */
export function expandForSuggest(baseResults, searchParams) {
  const hasProc = !!(searchParams && (searchParams.procAnyCode || searchParams.drugCode));
  const clsMax = new Map();
  for (const r of baseResults) {
    const sc = corrNum(r.surgVal);
    const ex = clsMax.get(r.cls);
    if (ex === undefined || sc > ex) clsMax.set(r.cls, sc);
  }
  const pcons = hasProc ? procConstraints(searchParams, (c) => clsMax.has(c)).cons : null;
  const expanded = [];
  for (const [cls, maxSurg] of clsMax) {
    const co = pcons ? pcons.get(cls) : null;
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (corrNum(info[3]) > maxSurg) continue;
      if (!matchProc(cls, info, co)) continue;
      expanded.push(toResult(code, info));
    }
  }
  return { expanded };
}

/* ── ドリルダウン ── */
export function filterDrillDown(expandedDPCs, drillP1, drillP2) {
  return expandedDPCs.filter((r) => {
    if (drillP1) {
      const cv = findCorrValForCls(r.cls, "p1", drillP1);
      if (cv === null || !matchVal(r.p1Val, corrToDigit(r.cls, r.surgVal, "1", cv))) return false;
    }
    if (drillP2) {
      const cv = findCorrValForCls(r.cls, "p2", drillP2);
      if (cv === null || !matchVal(r.p2Val, corrToDigit(r.cls, r.surgVal, "2", cv))) return false;
    }
    return true;
  });
}

/**
 * 「他に評価される項目」: 表示中DPCの分類×手術区分で定義されている処置等1・2の項目。
 * 選択済み項目がある場合は、その相関値より大きい（ツリー図で下＝高優先）項目のみ返す。
 */
export function getBranchOptions(expandedDPCs, drillP1, drillP2) {
  const pairs = new Map();
  for (const r of expandedDPCs) {
    const key = `${r.cls}_${r.surgVal}`;
    if (!pairs.has(key)) pairs.set(key, { cls: r.cls, surgVal: r.surgVal });
  }
  const p1Det = new Map(), p2Det = new Map();
  const collect = (det, table, type, drill, cls, surgVal, clsKey, withAlias) => {
    const grp = table[cls] || {};
    const minCv = drill ? corrNum(findCorrValForCls(cls, type, drill) || "0") : 0;
    const valKey = type === "p1" ? "p1Val" : "p2Val";
    const t = type === "p1" ? "1" : "2";
    for (const [cv, codes] of Object.entries(grp)) {
      if (cv === "0" || corrNum(cv) <= minCv) continue;
      const digit = corrToDigit(cls, surgVal, t, cv);
      if (!expandedDPCs.some((x) => x.cls === cls && x.surgVal === surgVal && x[valKey] === digit)) continue;
      for (const code of codes) {
        if (!det.has(code)) det.set(code, { code, name: D.cn[code] || "", drugAlias: withAlias ? D.da?.[code]?.[0] || "" : "", dkDrug: withAlias && isDekidakaDrug(code), entries: new Map() });
        const d = det.get(code);
        const ex = d.entries.get(clsKey);
        if (!ex || corrNum(cv) > corrNum(ex)) d.entries.set(clsKey, cv);
      }
    }
  };
  for (const [, { cls, surgVal }] of pairs) {
    const branches = D.br[cls]?.[surgVal] || {};
    const clsKey = `${cls}_${surgVal}`;
    if (branches["1"]) collect(p1Det, D.p1, "p1", drillP1, cls, surgVal, clsKey, false);
    if (branches["2"]) collect(p2Det, D.p2, "p2", drillP2, cls, surgVal, clsKey, true);
  }
  const finish = (det) => [...det.values()].map((d) => {
    const maxCv = [...d.entries.values()].reduce((a, b) => (corrNum(a) >= corrNum(b) ? a : b));
    return { code: d.code, name: d.name, drugAlias: d.drugAlias, dkDrug: d.dkDrug, maxCorrVal: maxCv };
  }).sort((a, b) => corrNum(b.maxCorrVal) - corrNum(a.maxCorrVal));
  return { p1Items: finish(p1Det), p2Items: finish(p2Det) };
}

/* ── 類似分類 ── */
export function getSimilarClassifications(cls) {
  const mdc = cls.slice(0, 2);
  const results = [];
  for (const [c, name] of Object.entries(D.cls)) {
    if (c.slice(0, 2) !== mdc || c === cls) continue;
    const codes = dpcCodesOf(c);
    if (!codes.length) continue;
    const surgSet = new Set();
    let minP1 = Infinity, maxP1 = 0, maxD3 = 0;
    for (const code of codes) {
      const info = D.dpc[code];
      surgSet.add(info[3]);
      const pt = info[10] || 0;
      if (pt > 0) { if (pt < minP1) minP1 = pt; if (pt > maxP1) maxP1 = pt; }
      const d3v = info[9] || 0;
      if (d3v > maxD3) maxD3 = d3v;
    }
    results.push({ cls: c, name, dpcCount: codes.length, surgCount: surgSet.size, minP1: minP1 === Infinity ? 0 : minP1, maxP1, maxD3 });
  }
  const num = (s) => parseInt(s.replace(/x/g, "0"), 10) || 0;
  results.sort((a, b) => Math.abs(num(a.cls) - num(cls)) - Math.abs(num(b.cls) - num(cls)));
  return results;
}

/* ── サジェストモード用 ── */
const DK_SUFFIX = "（出来高算定）";

/** 7-8桁目（病態等分類・年齢・JCS等）の条件ステップ。条件が1種類以下なら null */
export function getCondOptionsFromResults(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.pos78 || r.code.slice(6, 8);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { condVal: key, rawVal: key, label: key === "xx" ? "条件なし" : r.condLabel || key, maxPts: 0, count: 0, dk: true, clsNames: new Set() }));
    g.count++;
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
    g.clsNames.add(D.cls[r.cls] || r.cls);
  }
  if (groups.size <= 1) return null;
  return [...groups.values()].map((g) => ({ ...g, label: g.dk ? g.label + DK_SUFFIX : g.label, clsNames: [...g.clsNames] }))
    .sort((a, b) => (a.rawVal === "xx" ? 1 : b.rawVal === "xx" ? -1 : a.rawVal.localeCompare(b.rawVal)));
}

export function getSurgeryOptionsFromResults(expandedDPCs) {
  const groups = new Map(), pairSeen = new Map();
  for (const r of expandedDPCs) {
    const gKey = surgKey(r);
    const label = isNA(r.surgVal) ? NO_SURG_BRANCH_LABEL : r.surgeryName || "なし";
    let g = groups.get(gKey);
    if (!g) { groups.set(gKey, (g = { surgVal: gKey, rawVal: r.surgVal, label, maxPts: 0, dk: true })); pairSeen.set(gKey, new Set()); }
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
    pairSeen.get(gKey).add(r.cls);
  }
  for (const [gKey, g] of groups) {
    const allCodes = new Set();
    const clsSet = pairSeen.get(gKey);
    if (!isNA(g.rawVal)) {
      for (const cls of clsSet) {
        const idx = D.si?.[cls]?.[g.rawVal];
        if (idx === undefined) continue;
        for (const c of D.sl[idx] || []) allCodes.add(c);
      }
    }
    g.codes = [...allCodes].map((c) => ({ code: c, name: D.cn[c] || "" }));
    g.clsNames = [...clsSet].map((c) => D.cls[c] || c);
    if (g.dk) g.label += DK_SUFFIX;
  }
  return [...groups.values()].sort((a, b) => corrNum(a.rawVal) - corrNum(b.rawVal));
}

function procOptions(filteredDPCs, type) {
  const valKey = type === "p1" ? "p1Val" : "p2Val";
  const nameKey = type === "p1" ? "proc1Name" : "proc2Name";
  const brKey = type === "p1" ? "hasP1Branch" : "hasP2Branch";
  const t = type === "p1" ? "1" : "2";
  const table = type === "p1" ? D.p1 : D.p2;
  if (!filteredDPCs.some((r) => r[brKey])) return null;
  const groups = new Map(), pairSeen = new Map();
  for (const r of filteredDPCs) {
    if (!r[brKey]) continue;
    const gKey = `${r[valKey]}::${r[nameKey] || "なし"}`;
    let g = groups.get(gKey);
    if (!g) { groups.set(gKey, (g = { [valKey]: gKey, rawVal: r[valKey], label: r[nameKey] || "なし", maxPts: 0, dk: true })); pairSeen.set(gKey, new Map()); }
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
    pairSeen.get(gKey).set(`${r.cls}|${r.surgVal}`, { cls: r.cls, sv: r.surgVal });
  }
  for (const [gKey, g] of groups) {
    const allCodes = new Set(), clsSet = new Set();
    for (const { cls, sv } of pairSeen.get(gKey).values()) {
      clsSet.add(cls);
      const grp = table?.[cls] || {};
      // この桁に写像される対応コードすべてのコードを集める（縮約を考慮）
      for (const [cv, codes] of Object.entries(grp)) if (corrToDigit(cls, sv, t, cv) === g.rawVal) codes.forEach((c) => allCodes.add(c));
    }
    g.codes = [...allCodes].map((c) => ({ code: c, name: (type === "p2" && D.da?.[c]?.[0]) || D.cn[c] || "", dkDrug: type === "p2" && isDekidakaDrug(c) }));
    g.clsNames = [...clsSet].map((c) => D.cls[c] || c);
    if (g.dk) g.label += DK_SUFFIX;
  }
  return [...groups.values()].sort((a, b) => {
    if (a.rawVal === "0") return 1;
    if (b.rawVal === "0") return -1;
    return corrNum(b.rawVal) - corrNum(a.rawVal);
  });
}
export function getP1OptionsFromResults(filteredDPCs) { return procOptions(filteredDPCs, "p1"); }
export function getP2OptionsFromResults(filteredDPCs) { return procOptions(filteredDPCs, "p2"); }

export function getSubdiagOptionsFromResults(filteredDPCs) {
  if (!filteredDPCs.some((r) => r.hasSdBranch)) return null;
  const groups = new Map();
  for (const r of filteredDPCs) {
    if (!r.hasSdBranch) continue;
    let g = groups.get(r.sdVal);
    if (!g) groups.set(r.sdVal, (g = { sdVal: r.sdVal, label: r.subdiagName || "なし", maxPts: 0, dk: true, icds: getSubdiagICDs(r.cls, r.sdVal, r.surgVal) }));
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
  }
  return [...groups.values()].map((g) => ({ ...g, label: g.dk ? g.label + DK_SUFFIX : g.label })).sort((a, b) => {
    if (a.sdVal === "0") return 1;
    if (b.sdVal === "0") return -1;
    return corrNum(b.sdVal) - corrNum(a.sdVal);
  });
}

export function getSeverityOptionsFromResults(filteredDPCs) {
  if (!filteredDPCs.some((r) => r.severity)) return null;
  const groups = new Map();
  for (const r of filteredDPCs) {
    if (!r.severity) continue;
    const key = r.severity.value;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { sevVal: key, name: r.severity.name, label: r.severity.label, maxPts: 0, dk: true }));
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
  }
  return [...groups.values()].map((g) => ({ ...g, label: g.dk ? g.label + DK_SUFFIX : g.label })).sort((a, b) => (parseInt(a.sevVal) || 0) - (parseInt(b.sevVal) || 0));
}

export function getIcdCandidates(dpcResults) {
  const seen = new Set(), out = [];
  for (const r of dpcResults) {
    const codes = D.icd[r.cls];
    if (!codes) continue;
    for (const c of codes) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push({ code: c, name: cleanName(D.icn[c] || ""), cls: r.cls, clsName: r.clsName });
    }
  }
  return out;
}
