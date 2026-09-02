import { D } from "./data.js";

/* ──────────────────────────────────────────────────────────
 * DPC電子点数表データ（D）に対する検索・計算ロジック
 *
 * D.dpc[code] = [MDC, 分類4桁, 包括フラグ("1"=包括/"0"=出来高),
 *                手術区分(9-10桁目), 処置等1(11桁目), 処置等2(12桁目), 副傷病(13桁目),
 *                期間Ⅰ日数, 期間Ⅱ日数, 期間Ⅲ日数, 期間Ⅰ点数, 期間Ⅱ点数, 期間Ⅲ点数]
 * 手術区分〜副傷病はDPCコードの桁そのもので、"x"/"xx" は「その分岐が無い」ことを表す。
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
/** 手術リスト（"K1+K2" の組み合わせ要素を含む）にコードが含まれるか */
export function slHas(list, code) {
  if (!list || !code) return false;
  return list.some((e) => e === code || (e.includes("+") && e.split("+").includes(code)));
}

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
 * 入院日数 sd に対する包括点数。期間Ⅲを超える日数は overDays（出来高）として返す。
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

/* ── 出来高算定手術 ── */
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

/* ── 検索 ── */
/**
 * 条件に合致するDPCを返す。
 *  - icdCode: 分類を特定（M!!!!ルール含む）
 *  - surgeryCode: 手術区分を特定。ICD指定時に定義テーブルにないKコードなら
 *    「その他の手術あり(97)」として扱い、結果に surgFallback=true を付ける
 *  - procAnyCode / drugCode: 処置等1・2の相関値を特定
 */
export function searchDPC({ icdCode, surgeryCode, procAnyCode, drugCode }) {
  if (!icdCode && !surgeryCode && !procAnyCode && !drugCode) return [];
  let targetCls = null;
  if (icdCode) { targetCls = findCls(icdCode); if (!targetCls.length) return []; }
  const cons = {};
  const get = (c) => cons[c] || (cons[c] = {});
  const fallbackCls = new Set();

  if (surgeryCode) {
    if (surgeryCode === CODE_NO_SURGERY) {
      for (const c of targetCls || Object.keys(D.cls)) get(c).surg = "99";
    } else {
      for (const [c, si] of Object.entries(D.si)) {
        if (targetCls && !targetCls.includes(c)) continue;
        for (const [corr, idx] of Object.entries(si)) {
          if (slHas(D.sl[idx], surgeryCode)) { get(c).surg = corr; break; }
        }
      }
      if (targetCls) {
        for (const c of targetCls) {
          if (cons[c]?.surg !== undefined) continue;
          const svs = classSurgVals(c);
          if (svs.has("xx")) get(c).surg = "xx"; // 手術による分岐なし
          else if (svs.has("97")) { get(c).surg = "97"; fallbackCls.add(c); }
        }
      }
    }
  }

  const procFound = new Set(), drugFound = new Set();
  const applyProc = (table, key, code, found) => {
    for (const [c, grp] of Object.entries(table)) {
      if (targetCls && !targetCls.includes(c)) continue;
      if (surgeryCode && !cons[c]) continue;
      for (const [corr, codes] of Object.entries(grp)) {
        if (slHas(codes, code)) {
          const co = get(c);
          if (co[key] === undefined) co[key] = corr;
          found.add(c);
          break;
        }
      }
    }
  };
  if (procAnyCode) { applyProc(D.p1, "p1", procAnyCode, procFound); applyProc(D.p2, "p2", procAnyCode, procFound); }
  if (drugCode) applyProc(D.p2, "p2", drugCode, drugFound);

  if (surgeryCode || procAnyCode || drugCode) {
    for (const c of targetCls || Object.keys(cons)) {
      const co = get(c);
      if (procAnyCode && !procFound.has(c)) { delete cons[c]; continue; }
      if (drugCode && !drugFound.has(c)) { delete cons[c]; continue; }
      if (procAnyCode || drugCode) {
        if (co.p1 === undefined) co.p1 = "0";
        if (co.p2 === undefined) co.p2 = "0";
      }
    }
  }

  const sCls = targetCls || Object.keys(cons);
  const results = [];
  for (const cls of sCls) {
    const co = cons[cls] || {};
    if (surgeryCode && surgeryCode !== CODE_NO_SURGERY && co.surg === undefined) continue;
    if ((procAnyCode || drugCode) && !cons[cls]) continue;
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!matchVal(info[3], co.surg)) continue;
      if (!matchVal(info[4], co.p1)) continue;
      if (!matchVal(info[5], co.p2)) continue;
      const r = toResult(code, info);
      if (fallbackCls.has(cls)) r.surgFallback = true;
      results.push(r);
    }
  }
  results.sort((a, b) => (b.points[0] || 0) - (a.points[0] || 0));
  return results;
}

/** 病名・ICD-10コード・分類名（例: 脳腫瘍）で検索。分類名の一致は先頭に「分類」タグ付きで返す */
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
      r.push({ code: c, name: cleanName(n) });
      if (r.length >= 30) break;
    }
  }
  return r;
}

/**
 * 手術Kコード・名称で検索。定義テーブルの手術に加えて、
 * 出来高算定手術等コード（D.dk）と、定義テーブルにないKコードそのもの（その他の手術あり扱い）も候補に出す。
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
        r.push({ code: kc, name: D.cn[kc] || "", dk: isDekidakaOp(kc) });
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
  // Kコード形式の入力で完全一致がなければ、そのコードを「定義テーブルにない手術」として選べるようにする
  if (/^K\d{3}[\dA-Z\-ｲ-ﾝ]*$/.test(qn) && !r.some((x) => x.code === qn)) {
    r.push({ code: qn, name: "定義テーブルにないKコード（その他の手術ありとして検索）", tag: "97", free: true });
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
          if (dh(normalize(c)).includes(qd) || normalize(D.cn[c] || "").includes(qn)) {
            r.push({ code: c, name: D.cn[c] || "", tag });
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
        r.push({ code: c, name: dn });
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

export function findCorrValForCls(cls, type, code) {
  const map = type === "p1" ? D.p1[cls] : D.p2[cls];
  if (!map) return null;
  for (const [cv, codes] of Object.entries(map)) if (slHas(codes, code)) return cv;
  return null;
}

/* ── 一覧検索: 全分岐展開 ── */
export function getExpandedResults(baseResults, searchParams) {
  const pairs = new Set();
  const p1Cons = new Map(), p2Cons = new Map();
  const hasProc = !!(searchParams && (searchParams.procAnyCode || searchParams.drugCode));
  for (const r of baseResults) {
    pairs.add(`${r.cls}_${r.surgVal}`);
    if (hasProc) {
      if (!p1Cons.has(r.cls) && !isNA(r.p1Val)) p1Cons.set(r.cls, r.p1Val);
      if (!p2Cons.has(r.cls) && !isNA(r.p2Val)) p2Cons.set(r.cls, r.p2Val);
    }
  }
  const expanded = [];
  const clsSet = new Set([...pairs].map((p) => p.slice(0, 6)));
  for (const cls of clsSet) {
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (!pairs.has(`${cls}_${info[3]}`)) continue;
      if (hasProc) {
        if (!matchVal(info[4], p1Cons.get(cls))) continue;
        if (!matchVal(info[5], p2Cons.get(cls))) continue;
      }
      expanded.push(toResult(code, info));
    }
  }
  return expanded;
}

/* ── サジェスト: 候補展開 ── */
export function expandForSuggest(baseResults, searchParams) {
  const hasProc = !!(searchParams && (searchParams.procAnyCode || searchParams.drugCode));
  const p1Cons = new Map(), p2Cons = new Map();
  const clsMax = new Map();
  for (const r of baseResults) {
    const sc = corrNum(r.surgVal);
    const ex = clsMax.get(r.cls);
    if (ex === undefined || sc > ex) clsMax.set(r.cls, sc);
    if (hasProc) {
      if (!p1Cons.has(r.cls) && !isNA(r.p1Val)) p1Cons.set(r.cls, r.p1Val);
      if (!p2Cons.has(r.cls) && !isNA(r.p2Val)) p2Cons.set(r.cls, r.p2Val);
    }
  }
  const expanded = [];
  for (const [cls, maxSurg] of clsMax) {
    for (const code of dpcCodesOf(cls)) {
      const info = D.dpc[code];
      if (corrNum(info[3]) > maxSurg) continue;
      if (hasProc) {
        if (!matchVal(info[4], p1Cons.get(cls))) continue;
        if (!matchVal(info[5], p2Cons.get(cls))) continue;
      }
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
      if (cv === null || !matchVal(r.p1Val, cv)) return false;
    }
    if (drillP2) {
      const cv = findCorrValForCls(r.cls, "p2", drillP2);
      if (cv === null || !matchVal(r.p2Val, cv)) return false;
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
    for (const [cv, codes] of Object.entries(grp)) {
      if (cv === "0" || corrNum(cv) <= minCv) continue;
      if (!expandedDPCs.some((x) => x.cls === cls && x.surgVal === surgVal && x[valKey] === cv)) continue;
      for (const code of codes) {
        if (!det.has(code)) det.set(code, { code, name: D.cn[code] || "", drugAlias: withAlias ? D.da?.[code]?.[0] || "" : "", entries: new Map() });
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
    return { code: d.code, name: d.name, drugAlias: d.drugAlias, maxCorrVal: maxCv };
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
export const NO_SURG_BRANCH_LABEL = "手術による分岐なし";

export function getSurgeryOptionsFromResults(expandedDPCs) {
  const groups = new Map(), clsSeen = new Map();
  for (const r of expandedDPCs) {
    if (r.isDekidaka) continue;
    const label = isNA(r.surgVal) ? NO_SURG_BRANCH_LABEL : r.surgeryName || "なし";
    const gKey = `${r.surgVal}::${label}`;
    const g = groups.get(gKey);
    if (!g) { groups.set(gKey, { surgVal: gKey, rawVal: r.surgVal, label, maxPts: r.points[0] || 0 }); clsSeen.set(gKey, new Set([r.cls])); }
    else { if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0; clsSeen.get(gKey).add(r.cls); }
  }
  for (const [gKey, g] of groups) {
    const allCodes = new Set();
    const clsSet = clsSeen.get(gKey);
    if (!isNA(g.rawVal)) {
      for (const cls of clsSet) {
        const idx = D.si?.[cls]?.[g.rawVal];
        if (idx === undefined) continue;
        for (const c of D.sl[idx] || []) allCodes.add(c);
      }
    }
    g.codes = [...allCodes].map((c) => ({ code: c, name: D.cn[c] || "" }));
    g.clsNames = [...clsSet].map((c) => D.cls[c] || c);
  }
  return [...groups.values()].sort((a, b) => corrNum(a.rawVal) - corrNum(b.rawVal));
}

function procOptions(filteredDPCs, type) {
  const valKey = type === "p1" ? "p1Val" : "p2Val";
  const nameKey = type === "p1" ? "proc1Name" : "proc2Name";
  const brKey = type === "p1" ? "hasP1Branch" : "hasP2Branch";
  const table = type === "p1" ? D.p1 : D.p2;
  if (!filteredDPCs.some((r) => r[brKey])) return null;
  const groups = new Map(), clsSeen = new Map();
  for (const r of filteredDPCs) {
    if (r.isDekidaka || !r[brKey]) continue;
    const gKey = `${r[valKey]}::${r[nameKey] || "なし"}`;
    const g = groups.get(gKey);
    if (!g) { groups.set(gKey, { [valKey]: gKey, rawVal: r[valKey], label: r[nameKey] || "なし", maxPts: r.points[0] || 0 }); clsSeen.set(gKey, new Set([r.cls])); }
    else { if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0; clsSeen.get(gKey).add(r.cls); }
  }
  for (const [gKey, g] of groups) {
    const allCodes = new Set();
    const clsSet = clsSeen.get(gKey);
    for (const cls of clsSet) {
      const codes = table?.[cls]?.[g.rawVal];
      if (codes) codes.forEach((c) => allCodes.add(c));
    }
    g.codes = [...allCodes].map((c) => ({ code: c, name: (type === "p2" && D.da?.[c]?.[0]) || D.cn[c] || "" }));
    g.clsNames = [...clsSet].map((c) => D.cls[c] || c);
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
    if (r.isDekidaka || !r.hasSdBranch) continue;
    const g = groups.get(r.sdVal);
    if (!g) {
      groups.set(r.sdVal, { sdVal: r.sdVal, label: r.subdiagName || "なし", maxPts: r.points[0] || 0, icds: getSubdiagICDs(r.cls, r.sdVal, r.surgVal) });
    } else if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
  }
  return [...groups.values()].sort((a, b) => {
    if (a.sdVal === "0") return 1;
    if (b.sdVal === "0") return -1;
    return corrNum(b.sdVal) - corrNum(a.sdVal);
  });
}

export function getSeverityOptionsFromResults(filteredDPCs) {
  if (!filteredDPCs.some((r) => r.severity)) return null;
  const groups = new Map();
  for (const r of filteredDPCs) {
    if (r.isDekidaka || !r.severity) continue;
    const key = r.severity.value;
    const g = groups.get(key);
    if (!g) groups.set(key, { sevVal: key, name: r.severity.name, label: r.severity.label, maxPts: r.points[0] || 0 });
    else if ((r.points[0] || 0) > g.maxPts) g.maxPts = r.points[0] || 0;
  }
  return [...groups.values()].sort((a, b) => (parseInt(a.sevVal) || 0) - (parseInt(b.sevVal) || 0));
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
