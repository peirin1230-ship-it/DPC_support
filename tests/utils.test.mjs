// src/utils.js の検索・計算ロジックのテスト
// 対象データは src/data.js から動的に選ぶ（特定コードの改廃でテストが壊れないようにする）
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { D } from "../src/data.js";
import {
  normalize, corrNum, matchVal, slHas, calcTotal, totalVal, findCls, ICD_M_WILDCARD,
  searchDPC, getExpandedResults, expandForSuggest, filterDrillDown, getBranchOptions,
  getSubdiagICDs, getSurgeryOptionsFromResults, getP2OptionsFromResults, getSubdiagOptionsFromResults,
  buildResultFromCode, resultsOfClass, dpcCodesOf, isDekidakaOp, getSimilarClassifications, searchDrug, searchDisease, searchSurg,
  NO_SURG_BRANCH_LABEL, CODE_NO_SURGERY, corrToDigit, surgKey, getCondOptionsFromResults, isNonSurgeryCode, icdWarning, normalizeIcd, findClsInfo, stripSuspect, resolveIcdInput, icdNotFoundMessage, searchProc, inputEffect, normalizeSearchParams, getNoResultHints, searchDekidakaBranches, dekidakaBranchStats, branchConditionText } from "../src/utils.js";

const X = "x";
const first = (arr, pred) => arr.find(pred);

describe("基本ヘルパー", () => {
  test("normalize: 全角→半角・大文字化・空白除去", () => {
    assert.equal(normalize("ｋ５４９ 　abc"), "K549ABC");
    assert.equal(normalize("Ｉ６３．０"), "I63.0");
  });
  test("corrNum: base36、分岐なし(x)は -1", () => {
    assert.equal(corrNum("0"), 0); assert.equal(corrNum("9"), 9); assert.equal(corrNum("A"), 10); assert.equal(corrNum("G"), 16);
    assert.equal(corrNum("x"), -1); assert.equal(corrNum("xx"), -1); assert.equal(corrNum(undefined), -1);
  });
  test("matchVal: 条件なし・分岐なし(x)は常に一致", () => {
    assert.ok(matchVal("1", undefined)); assert.ok(matchVal("x", "1")); assert.ok(matchVal("1", "1")); assert.ok(!matchVal("2", "1"));
  });
  test("slHas: 組み合わせ手術 K1+K2 の構成要素にも一致", () => {
    assert.ok(slHas(["K001", "K002+K003"], "K002")); assert.ok(slHas(["K001", "K002+K003"], "K002+K003")); assert.ok(!slHas(["K001"], "K00"));
  });
});

describe("calcTotal（期間Ⅰ/Ⅱ/Ⅲの包括点数）", () => {
  const info = first(Object.values(D.dpc), (d) => d[2] === "1" && d[7] < d[8] && d[8] < d[9]);
  const days = [info[7], info[8], info[9]], pts = [info[10], info[11], info[12]];
  const [d1, d2, d3] = days, [p1, p2, p3] = pts;
  test("期間内の各境界で日数×点数の合計になる", () => {
    assert.equal(calcTotal(days, pts, 1).total, p1);
    assert.equal(calcTotal(days, pts, d1).total, d1 * p1);
    assert.equal(calcTotal(days, pts, d1 + 1).total, d1 * p1 + p2);
    assert.equal(calcTotal(days, pts, d2).total, d1 * p1 + (d2 - d1) * p2);
    assert.equal(calcTotal(days, pts, d3).total, d1 * p1 + (d2 - d1) * p2 + (d3 - d2) * p3);
  });
  test("期間Ⅲ超過分は出来高日数として返し、包括点数には含めない", () => {
    const r = calcTotal(days, pts, d3 + 5);
    assert.equal(r.total, calcTotal(days, pts, d3).total);
    assert.equal(r.overDays, 5); assert.equal(r.d3, d3);
    assert.equal(calcTotal(days, pts, d3).overDays, 0);
  });
  test("日数未入力・出来高DPCは null", () => {
    assert.equal(calcTotal(days, pts, 0), null); assert.equal(calcTotal(days, pts, ""), null);
    assert.equal(calcTotal([0, 0, 0], [0, 0, 0], 10), null);
    assert.equal(totalVal(days, pts, 0), 0);
  });
  test("期間Ⅱが存在しないDPC（d2=d1・点数Ⅱ=0）は期間Ⅰの翌日から期間Ⅲ点数で計算", () => {
    const info2 = first(Object.values(D.dpc), (d) => d[2] === "1" && d[7] === d[8] && d[11] === 0 && d[9] > d[7]);
    if (!info2) return; // このデータには存在しない
    const dd = [info2[7], info2[8], info2[9]], pp = [info2[10], info2[11], info2[12]];
    assert.equal(calcTotal(dd, pp, dd[0]).total, dd[0] * pp[0]);
    assert.equal(calcTotal(dd, pp, dd[0] + 3).total, dd[0] * pp[0] + 3 * pp[2]);
    assert.equal(calcTotal(dd, pp, dd[2] + 1).overDays, 1);
  });
  test("日ごとに積み上げた結果と一致する（回帰）", () => {
    for (const sd of [1, d1, d1 + 1, d2, d2 + 3, d3, d3 + 10]) {
      let t = 0;
      for (let d = 1; d <= Math.min(sd, d3); d++) t += d <= d1 ? p1 : d <= d2 ? p2 : p3;
      assert.equal(calcTotal(days, pts, sd).total, t, `sd=${sd}`);
    }
  });
});

describe("findCls（ICD-10 → 分類）", () => {
  test("完全一致・前方一致（$）・全角入力", () => {
    const [cls, codes] = first(Object.entries(D.icd), ([, c]) => c.some((x) => !x.endsWith("$") && x !== ICD_M_WILDCARD));
    const exact = codes.find((x) => !x.endsWith("$") && x !== ICD_M_WILDCARD);
    assert.ok(findCls(exact).includes(cls));
    assert.ok(findCls(normalize(exact).toLowerCase()).includes(cls), "小文字でも一致");
    const [cls2, codes2] = first(Object.entries(D.icd), ([, c]) => c.some((x) => x.endsWith("$")));
    const prefix = codes2.find((x) => x.endsWith("$")).slice(0, -1);
    assert.ok(findCls(prefix + "9").includes(cls2), "前方一致");
    assert.deepEqual(findCls("ZZZ99"), []);
  });
  test("ICDテーブルにないＭコードは 071030（M!!!!）に該当する", () => {
    const all = new Set(Object.values(D.icd).flat());
    const prefixes = [...all].filter((c) => c.endsWith("$")).map((c) => c.slice(0, -1));
    let unlisted = null;
    for (let i = 0; i < 10000 && !unlisted; i++) {
      const c = "M" + String(i).padStart(4, "0");
      if (!all.has(c) && !prefixes.some((p) => c.startsWith(p))) unlisted = c;
    }
    assert.ok(unlisted, "テーブル外のＭコードが見つからない");
    assert.deepEqual(findCls(unlisted), ["071030"]);
    assert.deepEqual(findCls(ICD_M_WILDCARD), ["071030"]);
  });
});

describe("searchDPC", () => {
  test("ICD検索: その分類の全DPCを返し、ラベルが埋まる", () => {
    const [cls, codes] = first(Object.entries(D.icd), ([c, arr]) => arr.some((x) => !x.endsWith("$") && x !== ICD_M_WILDCARD) && dpcCodesOf(c).length >= 3);
    const icd = codes.find((x) => !x.endsWith("$") && x !== ICD_M_WILDCARD);
    const r = searchDPC({ icdCode: icd });
    assert.ok(r.length >= dpcCodesOf(cls).length);
    for (const x of r) if (x.cls === cls) {
      assert.equal(x.clsName, D.cls[cls]);
      assert.ok(!/^\d+$/.test(x.surgeryName), `手術名に区分値がそのまま出ている: ${x.surgeryName}`);
      assert.equal(x.hasSurgBranch, x.surgVal !== "xx");
      if (!x.hasP1Branch) assert.equal(x.proc1Name, "-");
      if (!x.hasSdBranch) assert.equal(x.subdiagName, "-");
    }
  });
  test("手術なし(KKK0)検索: 手術区分 99 または分岐なし(xx) のみ", () => {
    const r = searchDPC({ surgeryCode: CODE_NO_SURGERY });
    assert.ok(r.length > 0);
    for (const x of r) assert.ok(x.surgVal === "99" || x.surgVal === "xx", x.code);
  });
  test("ICD + 定義済みKコード: その手術区分のDPCのみ", () => {
    const [cls, si] = first(Object.entries(D.si), ([c, m]) => Object.keys(m).some((k) => /^0\d$/.test(k)) && D.icd[c]);
    const sv = Object.keys(si).find((k) => /^0\d$/.test(k));
    const kcode = D.sl[si[sv]].find((k) => !k.includes("+"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    const r = searchDPC({ icdCode: icd, surgeryCode: kcode }).filter((x) => x.cls === cls);
    assert.ok(r.length > 0);
    for (const x of r) { assert.equal(x.surgVal, sv); assert.ok(!x.surgFallback); }
  });
  test("ICD + 定義テーブルにないKコード: その他の手術あり(97) にフォールバックし surgFallback を付ける", () => {
    const cls = first(Object.keys(D.cls), (c) => D.si[c]?.["97"] !== undefined && dpcCodesOf(c).some((code) => code.slice(8, 10) === "97"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    const fake = "K000-99";
    assert.ok(!D.sl.some((l) => slHas(l, fake)));
    const r = searchDPC({ icdCode: icd, surgeryCode: fake }).filter((x) => x.cls === cls);
    assert.ok(r.length > 0);
    for (const x of r) { assert.equal(x.surgVal, "97"); assert.equal(x.surgFallback, true); }
  });
  test("手術による分岐がない分類: Kコードを入れても除外されない", () => {
    const cls = first(Object.keys(D.cls), (c) => dpcCodesOf(c).every((code) => code.slice(8, 10) === "xx"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    const r = searchDPC({ icdCode: icd, surgeryCode: "K000-99" }).filter((x) => x.cls === cls);
    assert.equal(r.length, dpcCodesOf(cls).length);
    for (const x of r) { assert.equal(x.surgeryName, ""); assert.equal(x.hasSurgBranch, false); }
  });
  test("処置等2コード検索: 該当分類の相関値に一致（分岐なし x は許容）、処置等1は制約しない", () => {
    const [cls, grp] = first(Object.entries(D.p2), ([c, g]) => Object.keys(g).some((cv) => cv !== "0" && dpcCodesOf(c).some((code) => code[11] === cv)));
    const cv = Object.keys(grp).find((k) => k !== "0" && dpcCodesOf(cls).some((code) => code[11] === k));
    const code = grp[cv][0];
    const r = searchDPC({ procAnyCode: code });
    const mine = r.filter((x) => x.cls === cls);
    assert.ok(mine.length > 0);
    for (const x of mine) assert.ok(x.p2Val === corrToDigit(cls, x.surgVal, "2", cv) || x.p2Val === X, x.code);
    const p1Vals = new Set(dpcCodesOf(cls).filter((c) => c[11] === cv || c[11] === X).map((c) => c[10]));
    assert.deepEqual(new Set(mine.map((x) => x.p1Val)), p1Vals, "処置等1の全分岐が残る");
  });
  test("変換テーブルの縮約（対応コード→桁）を反映して処置等1を照合する", () => {
    const cls = Object.keys(D.cv)[0];
    if (!cls) return;
    const sv = Object.keys(D.cv[cls]).find((s) => D.cv[cls][s]["1"]);
    if (!sv) return;
    const [corr, digit] = Object.entries(D.cv[cls][sv]["1"])[0];
    assert.notEqual(corr, digit);
    assert.equal(corrToDigit(cls, sv, "1", corr), digit);
    const procCode = (D.p1[cls][corr] || []).find((c) => !c.includes("+"));
    const kcode = (D.sl[D.si[cls][sv]] || []).find((k) => !k.includes("+") && !k.startsWith("KKK"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    assert.ok(procCode && kcode, `${cls}/${sv}: テストデータ不足`);
    const r = searchDPC({ icdCode: icd, surgeryCode: kcode, procAnyCode: procCode }).filter((x) => x.cls === cls);
    assert.ok(r.length > 0, `${cls} ${kcode} ${procCode}: 該当なしになる（縮約未反映）`);
    for (const x of r) { assert.equal(x.surgVal, sv); assert.equal(x.p1Val, digit); }
  });
  test("処置等コードと薬剤コードを同時入力すると相関値の大きい方（下から優先）を採る", () => {
    for (const [cls, grp] of Object.entries(D.p2)) {
      const cvs = Object.keys(grp).filter((k) => k !== "0").sort((a, b) => corrNum(a) - corrNum(b));
      if (cvs.length < 2) continue;
      const low = cvs[0], high = cvs[cvs.length - 1];
      const proc = grp[low].find((c) => !/^\d{4}$/.test(c) && !c.includes("+"));
      const drug = grp[high].find((c) => /^\d{4}$/.test(c));
      if (!proc || !drug) continue;
      const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
      const r = searchDPC({ icdCode: icd, procAnyCode: proc, drugCode: drug }).filter((x) => x.cls === cls);
      if (!r.length) continue;
      for (const x of r) assert.ok(x.p2Val === corrToDigit(cls, x.surgVal, "2", high) || x.p2Val === X, `${cls}: ${x.code}`);
      return;
    }
  });
  test("組み合わせ手術 K1+K2: 片方のコードだけでは組み合わせの区分に確定せず、ヒントを付ける", () => {
    for (const [cls, si] of Object.entries(D.si)) {
      const standalone = new Set(Object.values(si).flatMap((idx) => (D.sl[idx] || []).filter((k) => !k.includes("+"))));
      let found = null;
      for (const [sv, idx] of Object.entries(si)) for (const e of D.sl[idx] || []) {
        if (!e.includes("+")) continue;
        const comp = e.split("+").find((p) => !standalone.has(p));
        if (comp) { found = { sv, e, comp }; break; }
      }
      if (!found || !D.icd[cls]) continue;
      const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
      const r = searchDPC({ icdCode: icd, surgeryCode: found.comp }).filter((x) => x.cls === cls);
      assert.ok(r.length > 0);
      for (const x of r) { assert.notEqual(x.surgVal, found.sv, `${cls}: 片方のみで ${found.e} の区分に確定`); assert.ok((x.comboHint || []).includes(found.e)); }
      const r2 = searchDPC({ icdCode: icd, surgeryCode: found.e }).filter((x) => x.cls === cls);
      assert.ok(r2.length > 0 && r2.every((x) => x.surgVal === found.sv), "組み合わせを選択すれば確定する");
      return;
    }
  });
  test("手術等管理料・輸血管理料（K914〜K917, K920-2）は手術なし(99)として扱う", () => {
    assert.ok(isNonSurgeryCode("K920-2") && isNonSurgeryCode("K915") && !isNonSurgeryCode("K920") && !isNonSurgeryCode("K546"));
    const cls = first(Object.keys(D.cls), (c) => dpcCodesOf(c).some((code) => code.slice(8, 10) === "99") && dpcCodesOf(c).some((code) => code.slice(8, 10) === "97"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    const r = searchDPC({ icdCode: icd, surgeryCode: "K920-2" }).filter((x) => x.cls === cls);
    assert.ok(r.length > 0);
    for (const x of r) { assert.equal(x.surgVal, "99"); assert.equal(x.surgExcluded, true); assert.ok(!x.surgFallback); }
  });
  test("icdWarning: C97・T14 は選択不可、T08/T10/T12 は留意", () => {
    assert.equal(icdWarning("C97").level, "forbid"); assert.equal(icdWarning("T140").level, "forbid"); assert.equal(icdWarning("T14").level, "forbid");
    assert.equal(icdWarning("T08").level, "caution"); assert.equal(icdWarning("T129").level, "caution");
    assert.equal(icdWarning("I200"), null); assert.equal(icdWarning("C970"), null);
  });
  test("条件なしは空配列", () => { assert.deepEqual(searchDPC({}), []); });
});

describe("展開・ドリルダウン", () => {
  test("getExpandedResults: 分類×手術区分ごとに全分岐を展開し、処置制約を保つ", () => {
    const [cls, grp] = first(Object.entries(D.p2), ([c, g]) => Object.keys(g).some((cv) => cv !== "0" && dpcCodesOf(c).some((code) => code[11] === cv)));
    const cv = Object.keys(grp).find((k) => k !== "0" && dpcCodesOf(cls).some((code) => code[11] === k));
    const p = { procAnyCode: grp[cv][0] };
    const base = searchDPC(p);
    const exp = getExpandedResults(base, p);
    const pairs = new Set(base.map((x) => `${x.cls}_${x.surgVal}`));
    for (const x of exp) assert.ok(pairs.has(`${x.cls}_${x.surgVal}`));
    for (const x of exp) if (x.cls === cls) assert.ok(x.p2Val === corrToDigit(cls, x.surgVal, "2", cv) || x.p2Val === X);
    const noProc = getExpandedResults(searchDPC({ icdCode: D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0") }));
    assert.ok(noProc.filter((x) => x.cls === cls).length === dpcCodesOf(cls).length);
  });
  test("getBranchOptions: 選択した項目より高い相関値（ツリー下位）だけが残る", () => {
    const [cls, grp] = first(Object.entries(D.p2), ([c, g]) => {
      const cvs = Object.keys(g).filter((cv) => cv !== "0" && dpcCodesOf(c).some((code) => code[11] === cv && code.slice(8, 10) === "99"));
      return cvs.length >= 2;
    });
    const cvs = Object.keys(grp).filter((cv) => cv !== "0" && dpcCodesOf(cls).some((code) => code[11] === cv && code.slice(8, 10) === "99")).sort((a, b) => corrNum(a) - corrNum(b));
    const all = resultsOfClass(cls).filter((x) => x.surgVal === "99");
    const initial = getBranchOptions(all, null, null);
    assert.ok(initial.p2Items.some((it) => grp[cvs[0]].includes(it.code)));
    const drill = grp[cvs[0]][0];
    const after = getBranchOptions(all, null, drill);
    for (const it of after.p2Items) assert.ok(corrNum(it.maxCorrVal) > corrNum(cvs[0]), `${it.code} ${it.maxCorrVal}`);
    const filtered = filterDrillDown(all, null, drill);
    for (const x of filtered) assert.ok(x.p2Val === cvs[0] || x.p2Val === X);
  });
  test("expandForSuggest: 分岐なし分類でも候補が出、選択肢のキーと行のキー（surgKey）が一致する", () => {
    const cls = first(Object.keys(D.cls), (c) => dpcCodesOf(c).every((code) => code.slice(8, 10) === "xx"));
    const icd = D.icd[cls].find((x) => x !== ICD_M_WILDCARD).replace(/\$$/, "0");
    const base = searchDPC({ icdCode: icd }).filter((x) => x.cls === cls);
    const { expanded } = expandForSuggest(base, {});
    const rows = expanded.filter((x) => x.cls === cls);
    assert.equal(rows.length, dpcCodesOf(cls).length);
    const opts = getSurgeryOptionsFromResults(rows);
    assert.equal(opts.length, 1); assert.ok(opts[0].label.startsWith(NO_SURG_BRANCH_LABEL));
    assert.ok(rows.every((x) => surgKey(x) === opts[0].surgVal), "SuggestRightPanel の絞り込みキーが一致しない（0件になる回帰）");
  });
  test("サジェスト経路: 全分類で手術ステップの選択肢キーが行キーと一致し、絞り込みが空にならない", () => {
    for (const cls of Object.keys(D.cls)) {
      const rows = resultsOfClass(cls);
      for (const o of getSurgeryOptionsFromResults(rows)) {
        assert.ok(rows.some((x) => surgKey(x) === o.surgVal), `${cls}: 選択肢 ${o.surgVal} に一致する行がない`);
      }
    }
  });
  test("getCondOptionsFromResults: 7-8桁目の条件が複数ある分類で選択肢が出る", () => {
    const cls = first(Object.keys(D.pt), (c) => Object.keys(D.pt[c]).length >= 2);
    const opts = getCondOptionsFromResults(resultsOfClass(cls));
    assert.ok(opts && opts.length >= 2);
    for (const o of opts) { assert.ok(D.pt[cls][o.condVal] === undefined ? o.condVal === "xx" : o.label.startsWith(D.pt[cls][o.condVal])); }
    const plain = first(Object.keys(D.cls), (c) => !D.pt[c]);
    assert.equal(getCondOptionsFromResults(resultsOfClass(plain)), null);
  });
  test("サジェスト選択肢: 出来高DPCも選択肢に残り「（出来高算定）」が付く", () => {
    const cls = first(Object.keys(D.cls), (c) => { const rows = resultsOfClass(c); return rows.some((x) => x.isDekidaka) && rows.some((x) => !x.isDekidaka) && rows.some((x) => x.hasSurgBranch); });
    const rows = resultsOfClass(cls);
    const opts = getSurgeryOptionsFromResults(rows);
    const dkOnly = new Set(rows.filter((x) => rows.filter((y) => y.surgVal === x.surgVal).every((y) => y.isDekidaka)).map((x) => x.surgVal));
    for (const o of opts) assert.equal(o.label.endsWith("（出来高算定）"), dkOnly.has(o.rawVal), `${cls} ${o.rawVal}`);
  });
  test("処置等2の選択肢は分岐のあるDPCからのみ作られる", () => {
    const cls = first(Object.keys(D.cls), (c) => dpcCodesOf(c).some((code) => code[11] !== X) && dpcCodesOf(c).some((code) => code[11] === X));
    const all = resultsOfClass(cls);
    const opts = getP2OptionsFromResults(all);
    assert.ok(opts && opts.length > 0);
    assert.equal(getP2OptionsFromResults(all.filter((x) => !x.hasP2Branch)), null);
  });
});

describe("副傷病・重症度・詳細", () => {
  test("getSubdiagICDs: フラグ別に手術あり/なしで絞り込む", () => {
    const [cls, byVal] = first(Object.entries(D.sd), ([, m]) => Object.values(m).some((e) => e.n || e.s));
    const [val, e] = Object.entries(byVal).find(([, x]) => x.n || x.s);
    const all = getSubdiagICDs(cls, val).map((x) => x.code + (x.isPrefix ? "$" : ""));
    const noSurg = getSubdiagICDs(cls, val, "99").map((x) => x.code + (x.isPrefix ? "$" : ""));
    const withSurg = getSubdiagICDs(cls, val, "01").map((x) => x.code + (x.isPrefix ? "$" : ""));
    for (const c of e.a || []) { assert.ok(noSurg.includes(c)); assert.ok(withSurg.includes(c)); }
    for (const c of e.n || []) { assert.ok(noSurg.includes(c)); assert.ok(!withSurg.includes(c)); assert.ok(all.includes(c)); }
    for (const c of e.s || []) { assert.ok(withSurg.includes(c)); assert.ok(!noSurg.includes(c)); }
    assert.deepEqual(getSubdiagICDs(cls, "0"), []); assert.deepEqual(getSubdiagICDs(cls, X), []);
  });
  test("getSubdiagOptionsFromResults: 副傷病分岐のある分類で選択肢が出る", () => {
    const cls = first(Object.keys(D.cls), (c) => dpcCodesOf(c).some((code) => code[12] === "1"));
    const opts = getSubdiagOptionsFromResults(resultsOfClass(cls).filter((x) => x.hasSdBranch));
    assert.ok(opts && opts.length >= 1);
    const withIcd = opts.find((o) => o.sdVal === "1");
    assert.ok(withIcd && withIcd.icds.length > 0);
  });
  test("buildResultFromCode: 重症度・条件ラベル", () => {
    const sevCode = first(Object.keys(D.dpc), (c) => c[13] !== X);
    const r = buildResultFromCode(sevCode);
    assert.ok(r.severity && r.severity.label && r.severity.name);
    const condCode = first(Object.keys(D.dpc), (c) => c.slice(6, 8) !== "xx");
    assert.ok(buildResultFromCode(condCode).condLabel);
    assert.equal(buildResultFromCode("00000000000000"), null);
  });
  test("getSimilarClassifications: 同一MDCで自分を除く", () => {
    const cls = Object.keys(D.cls)[0];
    const sims = getSimilarClassifications(cls);
    assert.ok(sims.length > 0);
    for (const s of sims) { assert.equal(s.cls.slice(0, 2), cls.slice(0, 2)); assert.notEqual(s.cls, cls); assert.ok(s.dpcCount > 0); }
  });
});

describe("オートコンプリート検索", () => {
  test("searchDisease: 分類名でも検索でき、選択した分類コードで findCls が解決する", () => {
    const [cls, name] = Object.entries(D.cls).find(([, n]) => n.length >= 3);
    const hits = searchDisease(name.slice(0, 3));
    const hit = hits.find((h) => h.code === cls);
    assert.ok(hit && hit.tag === "分類", `${name} が分類として見つからない`);
    assert.deepEqual(findCls(cls), [cls]);
  });
  test("searchSurg: 定義テーブル外の出来高算定Kコードと、任意のKコードを候補に出す", () => {
    const slCodes = new Set(D.sl.flat());
    const dkOnly = Object.keys(D.dk).find((k) => k.startsWith("K") && !slCodes.has(k));
    if (dkOnly) {
      const hit = searchSurg(dkOnly).find((h) => h.code === dkOnly);
      assert.ok(hit && hit.dk && hit.tag === "出来高");
    }
    const free = searchSurg("K000-99").find((h) => h.free);
    assert.ok(free && free.code === "K000-99" && free.tag === "97");
    const known = D.sl.flat().find((k) => /^K\d{3}$/.test(k));
    assert.ok(!searchSurg(known).some((h) => h.free), "定義済みコードに free 候補は付かない");
  });
});

describe("出来高・薬剤検索", () => {
  test("isDekidakaOp: 出来高算定手術コードと組み合わせ表記", () => {
    const k = Object.keys(D.dk).find((c) => c.startsWith("K"));
    assert.ok(isDekidakaOp(k)); assert.ok(isDekidakaOp(`K000-99+${k}`)); assert.ok(!isDekidakaOp("K000-99"));
  });
  test("searchDrug: 商品名別名で一般名コードが見つかる", () => {
    const [code, aliases] = Object.entries(D.da)[0];
    const hits = searchDrug(aliases[0]);
    assert.ok(hits.some((h) => h.code === code));
    assert.ok(hits.every((h) => /^\d{4}$/.test(h.code)));
  });
});

describe("病名・ICD入力の正規化と検索候補", () => {
  test("ドット付きICD表記（N39.0 / M48.06）はドット無しと同じ分類に解決し、M!!!! 誤適用を起こさない", () => {
    assert.equal(normalizeIcd("n39.0"), "N390");
    assert.deepEqual(findCls("N39.0"), findCls("N390"));
    assert.deepEqual(findClsInfo("M48.06"), findClsInfo("M4806"));
    assert.equal(findClsInfo("M48.06").mWildcard, false);
    assert.equal(findClsInfo("M0030").mWildcard, true);
    assert.deepEqual(findClsInfo("M0030").cls, ["071030"]);
    assert.deepEqual(findCls(ICD_M_WILDCARD), ["071030"]);
  });
  test("「○○疑い」「○○の疑い」は疑いを外して検索し、suspected を返す", () => {
    assert.deepEqual(stripSuspect("胃癌の疑い"), { q: "胃癌", suspected: true });
    assert.deepEqual(stripSuspect("胃癌疑"), { q: "胃癌", suspected: true });
    assert.deepEqual(stripSuspect("胃癌"), { q: "胃癌", suspected: false });
    assert.ok(searchDisease("胃癌疑い").some((r) => r.code === "C16$"));
  });
  test("別名・略語辞書（D.dn）と表記ゆれ（癌→悪性新生物、頸→頚）で候補が出る", () => {
    const ami = searchDisease("AMI");
    assert.ok(ami.length > 0 && ami[0].code === "I21$" && String(ami[0].tag).startsWith("別名"));
    assert.ok(searchDisease("胃癌").some((r) => r.code === "C16$"));
    assert.ok(searchDisease("肺がん").some((r) => r.code === "C34$"));
    assert.ok(searchDisease("大腿骨頸部骨折").some((r) => r.code === "S7200"));
    assert.deepEqual(searchDisease("RA"), [], "辞書にない英字1〜3文字は無関係な部分一致を返さない");
  });
  test("コード形式の入力はコード前方一致のみ、一般語は S コード等の主要候補が30件に入る", () => {
    const i6 = searchDisease("I6");
    assert.ok(i6.length > 0 && i6.every((r) => r.code.startsWith("I6")));
    const kossetsu = searchDisease("骨折");
    assert.ok(kossetsu.length <= 30);
    assert.ok(kossetsu.some((r) => /^S/.test(r.code)), "骨折で S コードが候補に含まれる");
    const tou = searchDisease("糖尿病");
    assert.ok(tou.some((r) => r.code === "E119"), "糖尿病で E119 が候補に含まれる");
  });
  test("候補未選択の生テキストは一意・分類名完全一致のときだけ採用し、それ以外は理由を返す", () => {
    assert.deepEqual(resolveIcdInput("N39.0"), { code: "N390", suspected: false });
    const nou = resolveIcdInput("脳梗塞");
    assert.equal(nou.code, "010060"); assert.equal(nou.adopted, true);
    const ami = resolveIcdInput("AMI疑い");
    assert.equal(ami.code, "I21$"); assert.equal(ami.suspected, true);
    assert.equal(resolveIcdInput("肺炎").reason, "ambiguous");
    assert.equal(resolveIcdInput("骨折").reason, "ambiguous");
    assert.equal(resolveIcdInput("存在しない病名XYZ").reason, "nomatch");
  });
  test("分類に解決できないICDの説明文は選択不可コードと未収載を区別する", () => {
    assert.match(icdNotFoundMessage("R509"), /Rコード/);
    assert.match(icdNotFoundMessage("Z000"), /Zコード/);
    assert.match(icdNotFoundMessage("B95"), /選択できません/);
    assert.match(icdNotFoundMessage("A999"), /収載されていません/);
  });
});

describe("入力した処置等が分岐に影響するか（procNeutral）と手術・処置等の別名", () => {
  test("狭心症 + 心カテ＋DD01: 手術なし(99)は処置等1=2で分岐、PCI(02)は縮約で「なし」と同じ桁、97は分岐なし", () => {
    const p = { icdCode: "I200", procAnyCode: "D2061+DD01" };
    const r = searchDPC(p);
    const by = (sv) => r.filter((x) => x.surgVal === sv);
    assert.ok(by("99").length > 0 && by("99").every((x) => x.p1Val === "2" && x.procNeutral === false));
    assert.ok(by("02").length > 0 && by("02").every((x) => x.p1Val === "0" && x.procNeutral === true));
    assert.ok(by("97").length > 0 && by("97").every((x) => x.procNeutral === true));
    // 一覧の展開結果・サジェストの展開結果にも同じフラグが付く
    for (const rows of [getExpandedResults(r, p), expandForSuggest(r, p).expanded]) {
      assert.ok(rows.some((x) => x.procNeutral === true) && rows.some((x) => x.procNeutral === false));
    }
    const opts = getSurgeryOptionsFromResults(expandForSuggest(r, p).expanded);
    assert.equal(opts.find((o) => o.rawVal === "02").neutral, true);
    assert.equal(opts.find((o) => o.rawVal === "99").neutral, false);
    // 処置等を指定しない検索ではフラグは付かない
    assert.ok(searchDPC({ icdCode: "I200" }).every((x) => x.procNeutral === undefined));
  });
  test("別名辞書（D.pn）: FFR/QFR → 心カテ＋血管内超音波検査等加算、PCI → 経皮的冠動脈ステント留置術等", () => {
    const ffr = searchProc("FFR");
    assert.ok(ffr.length >= 2 && ffr.every((x) => /\+DD01$/.test(x.code) && String(x.tag).startsWith("別名")));
    assert.ok(searchProc("qfr").some((x) => x.code === "D2061+DD01"));
    const pci = searchSurg("PCI");
    assert.ok(pci.length > 0 && pci[0].code.startsWith("K54") && String(pci[0].tag).startsWith("別名"));
    assert.ok(searchProc("ケモ").some((x) => x.code === "0005"));
    for (const [alias, codes] of Object.entries(D.pn)) assert.ok(codes.every((c) => D.cn[c] !== undefined || D.dk[c] !== undefined), alias);
  });
});

describe("複数入力の一括判定（手術・処置等・薬剤・病名候補を複数指定）", () => {
  test("単数・複数どちらの指定も同じ結果になる", () => {
    assert.deepEqual(normalizeSearchParams({ icdCode: "I200", surgeryCodes: ["K5493", "K5493"], procAnyCode: "G005" }), { icdCodes: ["I200"], surgeryCodes: ["K5493"], procCodes: ["G005"], drugCodes: [] });
    const a = searchDPC({ icdCode: "I200", surgeryCode: "K5493" }).map((r) => r.code).sort();
    const b = searchDPC({ icdCodes: ["I200"], surgeryCodes: ["K5493"] }).map((r) => r.code).sort();
    assert.deepEqual(a, b);
  });
  test("複数手術は「単独一致 → 組み合わせは全要素一致 → 区分番号が小さい方」で1区分に収束し、採用コードを surgBy に残す", () => {
    // PCI(02) + 心カテ＋DD01 + 輸血管理料（手術なし扱い）→ 02 に収束、処置等1は縮約で桁0
    const r = searchDPC({ icdCodes: ["I200"], surgeryCodes: ["K5493", "K920-2"], procCodes: ["D2061+DD01"] });
    assert.ok(r.length > 0 && r.every((x) => x.surgVal === "02" && x.p1Val === "0" && x.surgExcluded === true));
    assert.deepEqual(r[0].surgBy, ["K5493"]);
    // 組み合わせ手術は全要素が入力されたときだけ一致し、単独より高優先の区分になる
    const combo = searchDPC({ icdCodes: ["C710"], surgeryCodes: ["K1691", "K939-2"] });
    assert.ok(combo.length > 0 && combo.every((x) => x.surgVal === "02"));
    assert.deepEqual(combo[0].surgBy, ["K1691+K939-2"]);
    assert.deepEqual(combo[0].surgUnused, []);
    const single = searchDPC({ icdCodes: ["C710"], surgeryCodes: ["K1691"] });
    assert.ok(single.length > 0 && single.every((x) => x.surgVal === "03"));
    // 区分決定に使われなかった手術（その分類の定義テーブルに無い）は surgUnused に入る
    const extra = searchDPC({ icdCodes: ["I200"], surgeryCodes: ["K5493", "K386"] });
    assert.ok(extra.every((x) => x.surgVal === "02" && x.surgUnused.includes("K386")));
  });
  test("複数の処置等・薬剤は相関値最大を採用し、複数の病名候補は分類の和集合になる", () => {
    const r = searchDPC({ icdCodes: ["I200"], surgeryCodes: ["KKK0"], procCodes: ["G005", "J0451"], drugCodes: ["0022"] });
    assert.ok(r.length > 0 && r.every((x) => x.surgVal === "99" && x.p2Val === "3"), "tPA（相関値3）が採用される");
    const two = searchDPC({ icdCodes: ["I200", "I219"] });
    assert.deepEqual([...new Set(two.map((x) => x.cls))].sort(), ["050030", "050050"]);
    // 分類に解決できないICDが混ざっていても、解決できる分類で検索できる
    assert.equal(searchDPC({ icdCodes: ["I200", "R509"] }).length, searchDPC({ icdCodes: ["I200"] }).length);
    assert.ok(getNoResultHints({ procCodes: ["D4195"] }).evalItems.length > 0);
  });
});

describe("出来高評価（医科点数表算定コード）の分岐検索", () => {
  test("全件は包括フラグ0のDPCと一致し、条件文・MDC絞込・検索語が機能する", () => {
    const all = searchDekidakaBranches();
    const expected = Object.entries(D.dpc).filter(([, d]) => d[2] === "0").map(([c]) => c).sort();
    assert.deepEqual(all.map((r) => r.code).sort(), expected);
    assert.ok(all.every((r) => r.isDekidaka && r.condition && r.condition === branchConditionText(r)));
    const st = dekidakaBranchStats();
    assert.equal(st.total, expected.length);
    assert.equal(Object.values(st.byMdc).reduce((a, b) => a + b, 0), expected.length);
    const m06 = searchDekidakaBranches({ mdc: "06" });
    assert.ok(m06.length > 0 && m06.every((r) => r.code.startsWith("06")));
    // 分類名・分類コード・ICD・手術Kコードで引ける
    const byName = searchDekidakaBranches({ query: "脳腫瘍" });
    assert.ok(byName.length > 0 && byName.every((r) => r.cls === "010010"));
    assert.deepEqual(searchDekidakaBranches({ query: "010010" }).map((r) => r.code), byName.map((r) => r.code));
    const byIcd = searchDekidakaBranches({ query: "C34" });
    assert.ok(byIcd.length > 0 && byIcd.every((r) => (D.icd[r.cls] || []).some((ic) => ic.startsWith("C34"))));
    const byK = searchDekidakaBranches({ query: "K672-2" });
    assert.ok(byK.length > 0 && byK.every((r) => (D.sl[D.si[r.cls][r.surgVal]] || []).includes("K672-2")));
    assert.deepEqual(searchDekidakaBranches({ query: "存在しない検索語XYZ" }), []);
  });
});
