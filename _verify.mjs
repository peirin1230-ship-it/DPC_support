import { D } from "./src/data.js";
import { searchDPC, getExpandedResults, getBranchOptions, filterDrillDown, findCorrValForCls, hasBranch } from "./src/utils.js";

let pass = 0, fail = 0;
const cv36 = v => parseInt(v, 36) || 0;

function t(label, ok, detail) {
  if (ok) { pass++; }
  else { fail++; console.log(`  FAIL: ${label}${detail ? " — " + detail : ""}`); }
}

// ================================================================
console.log("=== 1. Initial display shows ALL branch DPCs ===");
{
  const r = searchDPC({ procAnyCode: "DD01" });
  const exp = getExpandedResults(r);
  // DD01 returns cls 050050 surgVal 99. Expanded should have ALL DPCs for this pair
  const allDpcs = Object.entries(D.dpc).filter(([, info]) => info[0] + info[1] === "050050" && info[3] === "99");
  t("expanded count matches DPC entries", exp.length === allDpcs.length,
    `exp=${exp.length} vs dpc=${allDpcs.length}`);
  // Initial display (no drill-down) = all expanded
  t("DD01 initial shows all branches", exp.length >= 10,
    `count=${exp.length}`);
  // Check various p1/p2 values are present
  t("has p1=0 entries", exp.some(x => x.p1Val === "0"));
  t("has p1=1 entries", exp.some(x => x.p1Val === "1"));
  t("has p1=2 entries", exp.some(x => x.p1Val === "2"));
  t("has p2=0 entries", exp.some(x => x.p2Val === "0"));
  t("has p2=1 entries", exp.some(x => x.p2Val === "1"));
  t("has p2=2 entries", exp.some(x => x.p2Val === "2"));
  t("has p2=3 entries", exp.some(x => x.p2Val === "3"));
}

// ================================================================
console.log("\n=== 2. Drill-down filter: constrains only selected dimensions ===");
{
  const r = searchDPC({ procAnyCode: "DD01" });
  const exp = getExpandedResults(r);

  // drillP2=J0384 → filter p2 only, p1 shows all
  const f1 = filterDrillDown(exp, null, "J0384");
  const f1_050050 = f1.filter(x => x.cls === "050050");
  const j0384cv = findCorrValForCls("050050", "p2", "J0384");
  t("drillP2=J0384: all results have p2=" + j0384cv,
    f1_050050.every(x => x.p2Val === j0384cv),
    `sample: ${f1_050050.slice(0, 3).map(x => x.code + " p2=" + x.p2Val).join(", ")}`);
  // p1 should be unconstrained (show all p1 values)
  const p1vals = new Set(f1_050050.map(x => x.p1Val));
  t("drillP2=J0384: p1 unconstrained (multiple values)",
    p1vals.size > 1, `p1vals: ${[...p1vals].join(",")}`);

  // drillP1=DD01 → filter p1 only, p2 shows all
  const dd01cv = findCorrValForCls("050050", "p1", "DD01");
  const f2 = filterDrillDown(exp, "DD01", null);
  const f2_050050 = f2.filter(x => x.cls === "050050");
  t("drillP1=DD01: all results have p1=" + dd01cv,
    f2_050050.every(x => x.p1Val === dd01cv));
  const p2vals = new Set(f2_050050.map(x => x.p2Val));
  t("drillP1=DD01: p2 unconstrained (multiple values)",
    p2vals.size > 1, `p2vals: ${[...p2vals].join(",")}`);

  // Both drilled: DD01 + J0384
  const f3 = filterDrillDown(exp, "DD01", "J0384");
  const f3_050050 = f3.filter(x => x.cls === "050050");
  t("both drilled: p1=" + dd01cv + " p2=" + j0384cv,
    f3_050050.every(x => x.p1Val === dd01cv && x.p2Val === j0384cv));
}

// ================================================================
console.log("\n=== 3. getBranchOptions: priority filtering after drill-down ===");
{
  const r = searchDPC({ procAnyCode: "DD01" });
  const exp = getExpandedResults(r);

  // No drill: show all cv > 0
  const opts0 = getBranchOptions(exp, null, null);
  t("no drill: p1 items shown (all cv>0)", opts0.p1Items.length > 0);
  t("no drill: p2 items shown (all cv>0)", opts0.p2Items.length > 0);

  // drillP1=DD01 (cv=2): p1 items only cv > 2
  const opts1 = getBranchOptions(exp, "DD01", null);
  const dd01cv = findCorrValForCls("050050", "p1", "DD01");
  const p1CvsAfterDrill = opts1.p1Items.map(x => x.maxCorrVal);
  t("drillP1=DD01: all p1 items have cv > " + dd01cv,
    p1CvsAfterDrill.every(cv => cv36(cv) > cv36(dd01cv)),
    `cvs: ${p1CvsAfterDrill.join(",")}`);
  // p2 should still show all (no drillP2)
  t("drillP1=DD01: p2 still shows all cv>0", opts1.p2Items.length > 0);

  // drillP2=J0384 (cv=2 for 050050): p2 items only cv > 2
  const opts2 = getBranchOptions(exp, null, "J0384");
  const j0384cv = findCorrValForCls("050050", "p2", "J0384");
  const p2CvsAfterDrill = opts2.p2Items.map(x => x.maxCorrVal);
  t("drillP2=J0384: p2 items cv > " + j0384cv + " only",
    p2CvsAfterDrill.length > 0 && p2CvsAfterDrill.every(cv => cv36(cv) > cv36(j0384cv)),
    `count=${p2CvsAfterDrill.length} cvs: ${p2CvsAfterDrill.slice(0, 5).join(",")}`);
  // p1 still shows all
  t("drillP2=J0384: p1 still shows all", opts2.p1Items.length > 0);
}

// ================================================================
console.log("\n=== 4. DPC coding compliance: specific patterns ===");

// Test: J0384 search → drill-down shows items, G005 at cv=1 shows (no drill selected yet)
{
  const r = searchDPC({ procAnyCode: "J0384" });
  const exp = getExpandedResults(r);
  const opts = getBranchOptions(exp, null, null);
  t("J0384 initial: G005 shows (all cv>0)", opts.p2Items.some(x => x.code === "G005"));
  t("J0384 initial: J0384 shows (all cv>0)", opts.p2Items.some(x => x.code === "J0384"));

  // After selecting J0384 in drill-down: G005 (cv=1) should be filtered (cv <= 2)
  const opts2 = getBranchOptions(exp, null, "J0384");
  t("drillP2=J0384: G005 filtered (cv=1 <= 2)", !opts2.p2Items.some(x => x.code === "G005"));
  t("drillP2=J0384: SPECT items show (cv=3 > 2)", opts2.p2Items.some(x => x.code === "0022"));
}

// Test: Surgery search shows all branches
{
  const r = searchDPC({ surgeryCode: "K552-22" });
  t("surgery search has results", r.length > 0);
  if (r.length > 0) {
    const exp = getExpandedResults(r);
    // Should have multiple p1/p2 variants
    const p1vals = new Set(exp.map(x => x.p1Val));
    const p2vals = new Set(exp.map(x => x.p2Val));
    t("surgery search: multiple p1 values in expanded", p1vals.size > 1, `${[...p1vals]}`);
    t("surgery search: multiple p2 values in expanded", p2vals.size > 1, `${[...p2vals]}`);
  }
}

// ================================================================
console.log("\n=== 5. Comprehensive: all cls with p1+p2 branches ===");
let clsOk = 0, clsFail = 0;
for (const [cls, brs] of Object.entries(D.br)) {
  for (const [sv, br] of Object.entries(brs)) {
    if (!br["1"] || !br["2"]) continue;
    const p1data = D.p1[cls] || {};
    const p2data = D.p2[cls] || {};
    const p1cvs = Object.keys(p1data).filter(k => k !== "0");
    const p2cvs = Object.keys(p2data).filter(k => k !== "0");
    if (p1cvs.length === 0 || p2cvs.length === 0) continue;

    const testCode = p1data[p1cvs[0]][0];
    const r = searchDPC({ procAnyCode: testCode });
    if (r.length === 0 || !r.some(x => x.cls === cls)) continue;
    const exp = getExpandedResults(r);

    // No drill: both p1 and p2 items should exist
    const opts = getBranchOptions(exp, null, null);
    if (opts.p2Items.length === 0) {
      clsFail++;
      if (clsFail <= 5) console.log(`  FAIL: ${cls} sv=${sv}: no p2 items (code=${testCode})`);
    } else { clsOk++; }

    // After drillP1 selection: p2 items still exist, p1 items filtered to higher cv
    const opts2 = getBranchOptions(exp, testCode, null);
    if (opts2.p2Items.length === 0) {
      clsFail++;
      if (clsFail <= 10) console.log(`  FAIL: ${cls} sv=${sv}: no p2 after drillP1 (code=${testCode})`);
    } else { clsOk++; }
  }
}
pass += clsOk; fail += clsFail;
console.log(`  ${clsOk} OK, ${clsFail} FAIL`);

// ================================================================
console.log("\n=== 6. Priority filtering: drill-down respects corrVal ordering ===");
{
  // For cls with multiple p2 corrVals, verify priority chain
  const cls050050 = "050050";
  const p2data = D.p2[cls050050] || {};
  const cvs = Object.keys(p2data).filter(k => k !== "0").sort((a, b) => cv36(a) - cv36(b));
  console.log(`  050050 p2 corrVals: ${cvs.join(", ")}`);

  const r = searchDPC({ procAnyCode: "DD01" });
  const exp = getExpandedResults(r);

  // Select cv=1 item (G005) → should still show cv=2 and cv=3 items
  const opts_cv1 = getBranchOptions(exp, null, "G005");
  const p2cvs_after_g005 = opts_cv1.p2Items.map(x => x.maxCorrVal);
  t("drillP2=G005(cv1): shows cv>1 items", p2cvs_after_g005.length > 0);
  t("drillP2=G005(cv1): all shown cvs > 1",
    p2cvs_after_g005.every(cv => cv36(cv) > 1),
    `cvs: ${p2cvs_after_g005.join(",")}`);

  // Select cv=2 item (J0384) → should only show cv=3 items
  const opts_cv2 = getBranchOptions(exp, null, "J0384");
  const p2cvs_after_j0384 = opts_cv2.p2Items.map(x => x.maxCorrVal);
  t("drillP2=J0384(cv2): shows cv>2 items", p2cvs_after_j0384.length > 0);
  t("drillP2=J0384(cv2): all shown cvs > 2",
    p2cvs_after_j0384.every(cv => cv36(cv) > 2),
    `cvs: ${p2cvs_after_j0384.join(",")}`);

  // Select cv=3 item (0022) → should show no more items (if max cv is 3)
  const opts_cv3 = getBranchOptions(exp, null, "0022");
  t("drillP2=0022(cv3): no items or only higher cv",
    opts_cv3.p2Items.length === 0 || opts_cv3.p2Items.every(x => cv36(x.maxCorrVal) > 3));
}

// ================================================================
console.log("\n=== 7. filterDrillDown: cls exclusion when code not applicable ===");
{
  // Search J0384 (p2 code in many cls)
  const r = searchDPC({ procAnyCode: "J0384" });
  const exp = getExpandedResults(r);

  // drillP2=J0384: for cls where J0384 doesn't exist in p2, DPCs excluded
  const f = filterDrillDown(exp, null, "J0384");
  for (const entry of f) {
    const cv = findCorrValForCls(entry.cls, "p2", "J0384");
    t(`${entry.code}: J0384 has cv=${cv} for cls ${entry.cls}`, cv !== null && entry.p2Val === cv);
    if (cv === null) break;
  }
}

// ================================================================
console.log("\n=== 8. Random procedure codes: expanded results correct ===");
{
  const allProcs = new Set();
  for (const p of Object.values(D.p1)) for (const [cv, codes] of Object.entries(p)) { if (cv !== "0") for (const c of codes) allProcs.add(c); }
  for (const p of Object.values(D.p2)) for (const [cv, codes] of Object.entries(p)) { if (cv !== "0") for (const c of codes) allProcs.add(c); }
  const sample = [...allProcs].sort(() => Math.random() - 0.5).slice(0, 30);
  let ok = 0, nok = 0;
  for (const code of sample) {
    const r = searchDPC({ procAnyCode: code });
    if (r.length === 0) continue;
    const exp = getExpandedResults(r);
    // Expanded should have more or equal entries than base results
    if (exp.length >= r.length) { ok++; }
    else { nok++; console.log(`  FAIL: ${code} exp=${exp.length} < results=${r.length}`); }
    // getBranchOptions should not crash
    const opts = getBranchOptions(exp, null, null);
    if (opts.p1Items || opts.p2Items) { ok++; }
    else { nok++; console.log(`  FAIL: ${code} getBranchOptions returned null`); }
  }
  pass += ok; fail += nok;
  console.log(`  ${ok} OK, ${nok} FAIL`);
}

// ================================================================
console.log(`\n${"=".repeat(50)}`);
console.log(`TOTAL: ${pass} PASS, ${fail} FAIL`);
if (fail === 0) console.log("ALL TESTS PASSED!");
