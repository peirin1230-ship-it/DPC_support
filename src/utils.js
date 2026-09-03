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
  const q = normalizeIcd(code || "").replace(/\$/, "");
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
/** ICD-10 コード表記の正規化: 全角→半角・大文字化に加え、"N39.0" のようなドット付き表記を "N390" にする */
export function normalizeIcd(s) {
  const q = normalize(s);
  return /^[A-Z]\d{2}\./.test(q) ? q.replace(/^([A-Z]\d{2})\./, "$1") : q;
}
export const ICD_M_WILDCARD_NOTE = "入力したMコードはICDテーブルに個別の記載がないため、「M!!!!（ICDテーブルにないMコード）」として 071030 その他の筋骨格系疾患 に該当します。部位付きの細分類コードが個別に定義されていないか確認してください。";
export const SUSPECT_NOTE = "疑い病名でも ICD-10・DPC は確定病名と同一です（退院時に確定していれば確定病名を選択）。ただし定義副傷病には疑い病名を含めません（保医発0321第6号 第2の2(2)）。";
/** 「○○疑い」「○○の疑い」の接尾語を外す。{ q, suspected } */
export function stripSuspect(text) {
  const raw = String(text ?? "").trim();
  const m = raw.match(/^(.+?)(?:の)?(?:疑い|疑)$/);
  return m ? { q: m[1].trim(), suspected: true } : { q: raw, suspected: false };
}
/** ICD→分類の解決結果。mWildcard は「M!!!!」ルール（ICDテーブルにないMコード→071030）で解決した場合 */
export function findClsInfo(icd) {
  if (!icd) return { cls: [], mWildcard: false };
  const q = normalizeIcd(icd);
  // 分類コード6桁（例: 010010, 01021x）が直接指定された場合
  if (q.length === 6 && /^\d{2}[0-9X]{4}$/.test(q) && D.cls[q.toLowerCase()]) return { cls: [q.toLowerCase()], mWildcard: false };
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
  if (!r.length && (/^M\d/.test(q) || q === ICD_M_WILDCARD)) {
    for (const [c, codes] of Object.entries(D.icd)) if (codes.includes(ICD_M_WILDCARD)) r.push(c);
    return { cls: r, mWildcard: r.length > 0 };
  }
  return { cls: r, mWildcard: false };
}
export function findCls(icd) { return findClsInfo(icd).cls; }
/** ICD が分類に解決できないときの説明文（選択不可コードと未収載コードを区別する） */
export function icdNotFoundMessage(code) {
  const q = normalizeIcd(code);
  if (/^R\d/.test(q)) return `${q}（症状・徴候のRコード）は原則として医療資源病名に選択できません（保医発0321第6号 第2の1(2)）。疑われる疾患または確定病名を選択してください。`;
  if (/^Z\d/.test(q)) return `${q}（Zコード）は医療資源病名に選択できません（保医発0321第6号 第2の1(2)）。`;
  if (/^U\d/.test(q)) return `${q}（Uコード）は原則として医療資源病名に選択できません。`;
  if (/^B(89|9[5-9])/.test(q)) return `${q} は医療資源病名に選択できません（保医発0321第6号 第2の1(2)）。原因菌ではなく感染症の病名を選択してください。`;
  return `${q} は電子点数表のICDテーブルに収載されていません（DPC対象外、または細分類コードの確認が必要です）。`;
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
export const DEKIDAKA_BRANCH_NOTE = "包括評価の対象外（医科点数表算定コード、樹形図の点線分岐）です。該当する患者は医科点数表（出来高）で算定し、レセプトの摘要欄に該当する診断群分類番号（DPCコード）を記載します（保医発0321第6号 第2の1(1)なお書き）。";
/** DPC行の分岐条件を1行の文章にする（出来高分岐一覧・判定根拠の表示用） */
export function branchConditionText(r) {
  const parts = [];
  if (r.condLabel) parts.push(r.condLabel);
  parts.push(isNA(r.surgVal) ? "手術による分岐なし" : `手術: ${r.surgeryName || "なし"}`);
  if (r.hasP1Branch) parts.push(`処置等1: ${r.proc1Name}`);
  if (r.hasP2Branch) parts.push(`処置等2: ${r.proc2Name}`);
  if (r.hasSdBranch) parts.push(`副傷病: ${r.subdiagName}`);
  if (r.severity) parts.push(`${r.severity.name}: ${r.severity.label}`);
  return parts.join(" ／ ");
}
let _dkBranches = null;
function dekidakaBranches() {
  if (!_dkBranches) {
    _dkBranches = [];
    for (const [code, info] of Object.entries(D.dpc)) {
      if (!(info[2] === "0" || info[2] === 0)) continue;
      const r = toResult(code, info);
      r.condition = branchConditionText(r);
      const surgCodes = isNA(r.surgVal) ? [] : (D.sl[D.si?.[r.cls]?.[r.surgVal]] || []);
      r._hay = normalize([r.cls, r.clsName, r.code, r.condition, ...surgCodes, ...surgCodes.map((k) => D.cn[k] || "")].join(" "));
      _dkBranches.push(r);
    }
    _dkBranches.sort((a, b) => a.code.localeCompare(b.code));
  }
  return _dkBranches;
}
/**
 * 出来高評価（医科点数表算定コード）のDPC分岐を検索する。
 * query は 分類コード・分類名・DPCコード・分岐条件（手術名/処置等名/副傷病/重症度）・その手術区分のKコード・分類のICDコード/病名 に部分一致。
 * mdc は上2桁で絞る。戻り値は分類コード順。
 */
export function searchDekidakaBranches({ query = "", mdc = "" } = {}) {
  const qn = normalizeIcd(query);
  const rows = [];
  for (const r of dekidakaBranches()) {
    if (mdc && !r.code.startsWith(mdc)) continue;
    if (qn) {
      let hit = r._hay.includes(qn);
      if (!hit) hit = (D.icd[r.cls] || []).some((ic) => normalize(ic).startsWith(qn) || normalize(D.icn[ic] || "").includes(qn));
      if (!hit) continue;
    }
    rows.push(r);
  }
  return rows;
}
/** 出来高分岐の件数（全体・MDC別・分類数） */
export function dekidakaBranchStats() {
  const all = dekidakaBranches();
  const byMdc = {};
  for (const r of all) byMdc[r.code.slice(0, 2)] = (byMdc[r.code.slice(0, 2)] || 0) + 1;
  return { total: all.length, classes: new Set(all.map((r) => r.cls)).size, byMdc };
}
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
export function procConstraints(params = {}, clsFilter) {
  const { procCodes, drugCodes } = normalizeSearchParams(params);
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
  for (const code of procCodes) { add(D.p1, "p1", code, procFound); add(D.p2, "p2", code, procFound); }
  for (const code of drugCodes) add(D.p2, "p2", code, drugFound);
  return { cons, procFound, drugFound };
}
/**
 * 入力した処置等（対応コード）が、そのDPC行の手術区分で分岐に影響するか。
 *  "branch": 入力によって桁が変わる（例: 手術なし 99 で 処置等1 2）
 *  "neutral": その手術区分では分岐が無い(x)か、縮約で「なし」と同じ桁になる（例: PCI あり では「なし、１,２あり」）
 */
export function inputEffect(cls, info, co) {
  const one = (type, corr, pos) => {
    if (corr === undefined || corr === null) return null;
    if (isNA(info[pos])) return "neutral";
    return corrToDigit(cls, info[3], type, corr) === corrToDigit(cls, info[3], type, "0") ? "neutral" : "branch";
  };
  return { p1: one("1", co.p1, 4), p2: one("2", co.p2, 5) };
}
function markInputEffect(r, cls, info, co) {
  if (!co) return r;
  const eff = inputEffect(cls, info, co);
  const vals = [eff.p1, eff.p2].filter(Boolean);
  if (vals.length) { r.inputEffect = eff; r.procNeutral = vals.every((v) => v === "neutral"); }
  return r;
}
export const RESOURCE_DISEASE_NOTE = "医療資源病名は、入院期間中に最も医療資源を投入した傷病名を1つ選びます（コーディングテキスト III.2、保医発0321第6号 第2の1）。点数・期間の並び替えや出来高の絞り込みは、候補の整理と委員会での差額分析のための表示で、点数の高低で病名を選ぶためのものではありません。";
export const INPUT_NEUTRAL_NOTE = "これらの候補では、入力した手術・処置等はDPCコードの桁を変えません（手術ありの区分で「なし、１,２あり」に統合される場合や、その区分に分岐が無い場合）。該当する手術を実施していればこれらのDPCになります。";
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
const toCodes = (single, many) => {
  const a = [];
  if (Array.isArray(many)) a.push(...many); else if (many) a.push(many);
  if (single) a.push(single);
  return [...new Set(a.map((x) => String(x ?? "").trim()).filter(Boolean))];
};
/** 検索条件を配列に正規化する（単数 icdCode/surgeryCode/procAnyCode/drugCode と複数 icdCodes/surgeryCodes/procCodes/drugCodes の両方を受け付ける） */
export function normalizeSearchParams(p = {}) {
  return {
    icdCodes: toCodes(p.icdCode, p.icdCodes),
    surgeryCodes: toCodes(p.surgeryCode, p.surgeryCodes),
    procCodes: toCodes(p.procAnyCode, p.procCodes),
    drugCodes: toCodes(p.drugCode, p.drugCodes),
  };
}
/**
 * 条件に合致するDPCを返す。各条件は複数指定できる（実施した手術・処置等をすべて入力すると「下から優先」で1区分に収束する）。
 *  - icdCodes: 医療資源病名の候補（複数なら分類の和集合。M!!!!ルール含む）
 *  - surgeryCodes: 実施した手術。分類ごとに「単独一致 or 組み合わせ全要素一致 → 区分番号が最小（ツリー図の下）」を採用し、
 *    どれも定義テーブルに無ければ「その他の手術あり(97)」（surgFallback）。手術等管理料・輸血管理料は手術なし扱い（surgExcluded）。
 *    採用した入力コードは surgBy、区分決定に使われなかった入力は surgUnused に入る。
 *  - procCodes / drugCodes: 処置等1・2の対応コード（複数該当は相関値最大＝高優先）。指定していない側の分岐は制約しない。
 */
export function searchDPC(params = {}) {
  const { icdCodes, surgeryCodes, procCodes, drugCodes } = normalizeSearchParams(params);
  if (!icdCodes.length && !surgeryCodes.length && !procCodes.length && !drugCodes.length) return [];
  let targetCls = null;
  if (icdCodes.length) { targetCls = [...new Set(icdCodes.flatMap((c) => findCls(c)))]; if (!targetCls.length) return []; }
  const inTarget = (c) => !targetCls || targetCls.includes(c);
  const surgCons = new Map(), surgBy = new Map(); // cls → 手術区分 / 区分を決めた入力コード
  const fallbackCls = new Set(), comboHints = new Map();
  const surgExcluded = surgeryCodes.some((c) => isNonSurgeryCode(c));
  const performed = new Set(surgeryCodes.filter((c) => !isNonSurgeryCode(c) && c !== CODE_NO_SURGERY));

  if (surgeryCodes.length) {
    if (!performed.size) {
      for (const c of targetCls || Object.keys(D.cls)) surgCons.set(c, "99");
    } else {
      // 単独コードの完全一致、または組み合わせ "K1+K2" の全要素が実施されている場合に一致
      const full = (kc) => performed.has(kc) || (kc.includes("+") && kc.split("+").every((p) => performed.has(p)));
      for (const [c, si] of Object.entries(D.si)) {
        if (!inTarget(c)) continue;
        let picked = null, by = [];
        for (const [corr, idx] of Object.entries(si)) {
          const matched = (D.sl[idx] || []).filter(full);
          if (!matched.length) continue;
          // 複数区分に一致する場合は高優先（番号の小さい定義手術＝ツリー図の下）を採る
          if (picked === null || surgPriority(corr) > surgPriority(picked)) { picked = corr; by = matched; }
        }
        if (picked !== null) { surgCons.set(c, picked); surgBy.set(c, [...new Set(by)]); }
        const hints = [...performed].flatMap((code) => Object.values(si).flatMap((idx) => combosContaining(D.sl[idx], code))).filter((h) => !full(h));
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

  const { cons: pcons, procFound, drugFound } = procConstraints({ procCodes, drugCodes }, (c) => inTarget(c) && (!surgeryCodes.length || surgCons.has(c)));

  const candidates = targetCls || [...new Set([...surgCons.keys(), ...pcons.keys()])];
  const results = [];
  for (const cls of candidates) {
    if (surgeryCodes.length && !surgCons.has(cls)) continue;
    if (procCodes.length && !procFound.has(cls)) continue;
    if (drugCodes.length && !drugFound.has(cls)) continue;
    const surg = surgCons.get(cls);
    const co = pcons.get(cls);
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!matchVal(info[3], surg)) continue;
      if (!matchProc(cls, info, co)) continue;
      const r = markInputEffect(toResult(code, info), cls, info, co);
      if (fallbackCls.has(cls)) r.surgFallback = true;
      if (surgExcluded) r.surgExcluded = true;
      if (comboHints.has(cls)) r.comboHint = comboHints.get(cls);
      if (surgBy.has(cls)) {
        const by = surgBy.get(cls);
        r.surgBy = by;
        const used = new Set(by.flatMap((k) => k.split("+")));
        r.surgUnused = [...performed].filter((k) => !used.has(k));
      } else if (performed.size) r.surgUnused = [...performed];
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

/* ── 病名検索 ── */
const VAGUE_NAME_RE = /その他|詳細不明|部位不明|他に分類されない/;
/** 表記ゆれの吸収: 癌・がん・悪性腫瘍 → 悪性新生物（トークン分割）、頸→頚、嚢→のう */
function diseaseTokens(qn) {
  const s = qn.replace(/頸/g, "頚").replace(/嚢/g, "のう").replace(/悪性腫瘍|癌|がん|ガン/g, "\u0000悪性新生物\u0000");
  return s.split("\u0000").filter(Boolean);
}
let _aliasIndex = null;
function aliasIndex() {
  if (!_aliasIndex) {
    _aliasIndex = [];
    for (const [alias, codes] of Object.entries(D.dn || {})) _aliasIndex.push({ alias, an: normalize(alias), codes });
  }
  return _aliasIndex;
}
/** 名称の一致度（小さいほど良い）。-1 は不一致 */
function nameScore(nn, qn, tokens) {
  if (nn === qn) return 0;
  if (nn.startsWith(qn)) return 1;
  if (nn.includes(qn)) return 2;
  if (tokens.length > 1 && tokens.every((t) => nn.includes(t))) return 3;
  if (tokens.length === 1 && tokens[0] !== qn && nn.includes(tokens[0])) return 3;
  return -1;
}
/**
 * 病名・ICD-10・分類コードのオートコンプリート候補。
 * 一致度（完全一致 > 前方一致 > 部分一致 > 表記ゆれ一致）、曖昧な名称（その他・詳細不明）の後回し、名称の短さの順に並べる。
 * 「○○疑い」は疑いを外して検索し、別名・略語（database/disease-aliases.json）は「別名」タグで返す。
 * コード形式の入力（I63, N39.0 等）はコードの前方一致のみ、英字1〜3文字は別名辞書のみを見る。
 */
export function searchDisease(q) {
  if (!q || String(q).trim().length < 1) return [];
  const { q: q0 } = stripSuspect(q);
  const qn = normalizeIcd(q0);
  if (!qn) return [];
  const codeLike = /^[A-Z]\d/.test(qn);
  const clsLike = /^\d{2,6}$/.test(qn);
  const shortAlpha = /^[A-Z]{1,3}$/.test(qn);
  const tokens = diseaseTokens(qn);
  const out = [];
  // 分類（6桁コード・分類名）
  if (!codeLike && !shortAlpha) {
    const cls = [];
    for (const [c, n] of Object.entries(D.cls)) {
      const nn = normalize(n);
      let sc = clsLike ? (c.startsWith(qn.toLowerCase()) ? 1 : -1) : nameScore(nn, qn, tokens);
      if (sc < 0) continue;
      cls.push({ code: c, name: n, tag: "分類", _s: sc * 1000 + nn.length });
    }
    cls.sort((a, b) => a._s - b._s || a.code.localeCompare(b.code));
    out.push(...cls.slice(0, 5));
  }
  // 別名・略語
  const seen = new Set();
  if (!clsLike) {
    const hits = [];
    for (const { alias, an, codes } of aliasIndex()) {
      const sc = an === qn ? 0 : (!shortAlpha && qn.length >= 2 && an.startsWith(qn)) ? 1 : -1;
      if (sc < 0) continue;
      for (const c of codes) if (!seen.has(c) && D.icn[c]) { seen.add(c); hits.push({ code: c, name: cleanName(D.icn[c]), tag: `別名: ${alias}`, _s: sc * 1000 }); }
    }
    hits.sort((a, b) => a._s - b._s || a.code.localeCompare(b.code));
    out.push(...hits);
  }
  // ICD-10 名称・コード
  if (!shortAlpha && !clsLike) {
    const icds = [];
    for (const [c, n] of Object.entries(D.icn)) {
      if (seen.has(c)) continue;
      const cn = normalize(c);
      const isP = c.endsWith("$");
      const base = isP ? cn.slice(0, -1) : cn;
      let sc = -1;
      if (codeLike) {
        if (cn.startsWith(qn) || base.startsWith(qn) || (isP && qn.startsWith(base))) sc = qn.length >= base.length ? 0 : 1;
      } else {
        sc = nameScore(normalize(n), qn, tokens);
      }
      if (sc < 0) continue;
      const w = icdWarning(c);
      icds.push({ code: c, name: cleanName(n), ...(w ? { tag: w.tag, warn: w.level } : {}), _s: sc * 1000 + (VAGUE_NAME_RE.test(n) ? 300 : 0) + Math.min(normalize(n).length, 200) });
    }
    icds.sort((a, b) => a._s - b._s || a.code.localeCompare(b.code));
    out.push(...icds.slice(0, Math.max(0, 30 - Math.min(out.length, 10))));
  }
  return out.map(({ _s, ...rest }) => rest);
}
/**
 * 入力欄の生テキスト（候補未選択）から ICD/分類コードを解決する。
 * コード形式ならそのまま、病名テキストなら候補が一意または分類名の前方一致のときだけ採用する。
 * 戻り値: { code, name?, adopted?, suspected, reason?: "nomatch"|"ambiguous", candidates? }
 */
export function resolveIcdInput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { code: "", suspected: false };
  const { q, suspected } = stripSuspect(raw);
  const qn = normalizeIcd(q);
  if (/^[A-Z]\d{2}/.test(qn) || /^\d{2}[0-9X]{4}$/.test(qn)) return { code: qn, suspected };
  const cands = searchDisease(q);
  if (!cands.length) return { code: "", suspected, reason: "nomatch" };
  const top = cands[0], tn = normalize(top.name), qq = normalize(q);
  const unique = cands.length === 1;
  const clsHit = top.tag === "分類" && tn === qq; // 分類名と完全一致するときだけ採用（「骨折」→「骨折変形癒合…」のような前方一致は採用しない）
  const aliasHit = String(top.tag || "").startsWith("別名") && cands.filter((c) => String(c.tag || "").startsWith("別名")).length === 1;
  if (unique || clsHit || aliasHit) return { code: top.code, name: top.name, adopted: true, suspected };
  return { code: "", suspected, reason: "ambiguous", candidates: cands.length };
}

/**
 * 手術Kコード・名称で検索。定義テーブルの手術（組み合わせ "K1+K2" は1件として）に加えて、
 * 出来高算定手術等コード（D.dk）、手術等管理料・輸血管理料（手術なし扱い）、
 * 定義テーブルにないKコードそのもの（その他の手術あり扱い）も候補に出す。
 */
/* ── 手術・処置等の別名（現場用語 → コード、database/procedure-aliases.json 由来） ── */
let _procAliasIndex = null;
function procAliasIndex() {
  if (!_procAliasIndex) {
    _procAliasIndex = [];
    for (const [alias, codes] of Object.entries(D.pn || {})) _procAliasIndex.push({ alias, an: normalize(alias), ad: dh(normalize(alias)), codes });
  }
  return _procAliasIndex;
}
/** 別名辞書に一致するコード（filter で対象コード集合を絞る）。完全一致 > 前方一致（2文字以上） */
function aliasHits(qn, filter) {
  const qd = dh(qn), out = [], seen = new Set();
  const hits = [];
  for (const { alias, an, ad, codes } of procAliasIndex()) {
    const sc = an === qn || ad === qd ? 0 : (qn.length >= 3 && (an.startsWith(qn) || ad.startsWith(qd))) ? 1 : -1;
    if (sc >= 0) hits.push({ alias, codes, sc });
  }
  hits.sort((a, b) => a.sc - b.sc || a.alias.localeCompare(b.alias));
  for (const { alias, codes } of hits) for (const c of codes) {
    if (seen.has(c) || !filter(c)) continue;
    seen.add(c); out.push({ code: c, alias });
    if (out.length >= 40) return out; // 候補一覧が長くなりすぎないよう上限
  }
  return out;
}
let _surgCodeSet = null;
function surgCodeSet() {
  if (!_surgCodeSet) _surgCodeSet = new Set(D.sl.flat());
  return _surgCodeSet;
}
export function searchSurg(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q), qd = dh(qn);
  const r = [], seen = new Set();
  for (const { code: kc, alias } of aliasHits(qn, (c) => surgCodeSet().has(c) || !!D.dk?.[c])) {
    r.push({ code: kc, name: D.cn[kc] || D.dk?.[kc] || "", dk: isDekidakaOp(kc), tag: `別名: ${alias}` });
    seen.add(kc);
  }
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

let _procCodeSet = null;
function procCodeSet() {
  if (!_procCodeSet) _procCodeSet = new Set([...Object.values(D.p1), ...Object.values(D.p2)].flatMap((g) => Object.values(g).flat()));
  return _procCodeSet;
}
export function searchProc(q) {
  if (!q || q.length < 1) return [];
  const qn = normalize(q), qd = dh(qn);
  const r = [], seen = new Set();
  for (const { code: c, alias } of aliasHits(qn, (c) => procCodeSet().has(c))) {
    r.push({ code: c, name: D.cn[c] || "", tag: `別名: ${alias}` });
    seen.add(c);
  }
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
export function getNoResultHints(params = {}) {
  const { procCodes, drugCodes } = normalizeSearchParams(params);
  if (!procCodes.length && !drugCodes.length) return null;
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
  for (const c of procCodes) { collect(D.p1, c, "処置1"); collect(D.p2, c, "処置2"); }
  for (const c of drugCodes) collect(D.p2, c, "処置2");
  const code = procCodes[0] || drugCodes[0];
  return { code, name: D.cn[code] || "", evalItems, codes: [...procCodes, ...drugCodes] };
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
  // 分類ごとの手術決定に関する情報（採用した手術・不採用の手術・97フォールバック等）は展開結果にも引き継ぐ
  const clsFlags = new Map();
  for (const r of baseResults) {
    pairs.add(`${r.cls}_${r.surgVal}`);
    if (!clsFlags.has(r.cls)) clsFlags.set(r.cls, { surgBy: r.surgBy, surgUnused: r.surgUnused, surgFallback: r.surgFallback, surgExcluded: r.surgExcluded, comboHint: r.comboHint });
  }
  const hasProc = !!searchParams && (() => { const np = normalizeSearchParams(searchParams); return np.procCodes.length > 0 || np.drugCodes.length > 0; })();
  const clsSet = new Set([...pairs].map((p) => p.slice(0, 6)));
  const pcons = hasProc ? procConstraints(searchParams, (c) => clsSet.has(c)).cons : null;
  const expanded = [];
  for (const cls of clsSet) {
    const co = pcons ? pcons.get(cls) : null;
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!pairs.has(`${cls}_${info[3]}`)) continue;
      if (!matchProc(cls, info, co)) continue;
      const r = markInputEffect(toResult(code, info), cls, info, co);
      const f = clsFlags.get(cls);
      if (f) for (const k of ["surgBy", "surgUnused", "surgFallback", "surgExcluded", "comboHint"]) if (f[k] !== undefined) r[k] = f[k];
      expanded.push(r);
    }
  }
  return expanded;
}

/* ── サジェスト: 候補展開 ── */
export function expandForSuggest(baseResults, searchParams) {
  const hasProc = !!searchParams && (() => { const np = normalizeSearchParams(searchParams); return np.procCodes.length > 0 || np.drugCodes.length > 0; })();
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
      expanded.push(markInputEffect(toResult(code, info), cls, info, co));
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
    if (!g) { groups.set(gKey, (g = { surgVal: gKey, rawVal: r.surgVal, label, maxPts: 0, dk: true, neutral: true, hasInput: false })); pairSeen.set(gKey, new Set()); }
    if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
    if (!r.isDekidaka) g.dk = false;
    if (r.inputEffect) g.hasInput = true;
    if (!r.procNeutral) g.neutral = false;
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
