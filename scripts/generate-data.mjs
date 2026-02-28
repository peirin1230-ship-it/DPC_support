#!/usr/bin/env node
/**
 * DPC電子点数表 Excel → src/data.js 変換スクリプト
 *
 * 使い方:
 *   1. database/ フォルダに厚生労働省の DPC電子点数表 Excel を配置
 *   2. node scripts/generate-data.mjs
 *
 * ファイル名は改定ごとに変わるため、シート名で自動検出します。
 * 検出できない場合はコマンドライン引数でパスを指定:
 *   node scripts/generate-data.mjs --file database/新ファイル名.xlsx
 *
 * オプション:
 *   --file <path>     電子点数表Excelのパスを直接指定
 *   --out <path>      出力先（デフォルト: src/data.js）
 *   --keep-da         既存の D.da（薬剤別名）を保持してマージ
 *   --dry-run         ファイル出力せず件数のみ表示
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── 定数 ──
const ROOT = resolve(import.meta.dirname, "..");
const DB_DIR = join(ROOT, "database");
const DEFAULT_OUT = join(ROOT, "src", "data.js");

const IDENTIFIER_SHEETS = [
  "診断群分類点数表",
  "変換テーブル",
  "分類名称",
  "ＩＣＤ",
  "手術",
];

// ── 引数解析 ──
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const argFile = getArg("--file");
const argOut = getArg("--out") || DEFAULT_OUT;
const keepDa = args.includes("--keep-da");
const dryRun = args.includes("--dry-run");

// ── ユーティリティ ──
function str(v) {
  if (v == null) return "";
  return String(v).trim();
}
function pad2(v) {
  const s = str(v);
  return s.length === 1 ? "0" + s : s;
}
function pad4(v) {
  const s = str(v);
  return s.padStart(4, "0");
}
function normSheet(name) {
  return name.replace(/\s+/g, " ").trim();
}
function findSheet(wb, keyword) {
  const found = wb.SheetNames.find((n) => normSheet(n).includes(keyword));
  if (!found) {
    console.error(`[ERROR] シート「${keyword}」が見つかりません`);
    console.error("  利用可能なシート:", wb.SheetNames.join(", "));
    process.exit(1);
  }
  return found;
}
function readSheet(wb, keyword) {
  const name = findSheet(wb, keyword);
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`  ${name}: ${rows.length} 行`);
  return rows;
}

// ── メイン ──

function detectFile() {
  if (argFile) {
    if (!existsSync(argFile)) {
      console.error(`[ERROR] 指定ファイルが見つかりません: ${argFile}`);
      process.exit(1);
    }
    return resolve(argFile);
  }
  if (!existsSync(DB_DIR)) {
    console.error(
      `[ERROR] database/ ディレクトリが見つかりません。\n` +
      `  → 厚生労働省の電子点数表Excelを database/ に配置してください。`
    );
    process.exit(1);
  }
  const xlsxFiles = readdirSync(DB_DIR).filter(
    (f) => f.endsWith(".xlsx") && !f.startsWith("~$")
  );
  for (const f of xlsxFiles) {
    const path = join(DB_DIR, f);
    try {
      const wb = XLSX.readFile(path, { bookSheets: true });
      const names = wb.SheetNames.map(normSheet);
      const matched = IDENTIFIER_SHEETS.every((id) =>
        names.some((n) => n.includes(id))
      );
      if (matched) {
        console.log(`[自動検出] ${f}`);
        return path;
      }
    } catch { /* skip */ }
  }
  console.error(
    `[ERROR] database/ 内に DPC電子点数表の Excel が見つかりません。\n` +
    `  → --file オプションでパスを直接指定するか、\n` +
    `     database/ に厚生労働省の電子点数表Excelを配置してください。\n` +
    `  検索対象: ${xlsxFiles.join(", ") || "(xlsxファイルなし)"}`
  );
  process.exit(1);
}

const excelPath = detectFile();
console.log(`\n読み込み中: ${excelPath}`);
const wb = XLSX.readFile(excelPath);
console.log(`シート数: ${wb.SheetNames.length}\n`);

console.log("シート読み込み:");
const sheetCls = readSheet(wb, "分類名称");
const sheetPt = readSheet(wb, "病態等分類");
const sheetIcd = readSheet(wb, "ＩＣＤ");
const sheetSurg = readSheet(wb, "手術");
const sheetP1 = readSheet(wb, "手術・処置等１");
const sheetP2 = readSheet(wb, "手術・処置等２");
const sheetSd = readSheet(wb, "定義副傷病");
const sheetSv1 = readSheet(wb, "重症度等（ＪＣＳ等）");
const sheetSv2 = readSheet(wb, "重症度等（手術等）");
const sheetSv3 = readSheet(wb, "重症度等（重症・軽症）");
const sheetSv4 = readSheet(wb, "重症度等（脳卒中の発症時期等）");
const sheetScore = readSheet(wb, "診断群分類点数表");
const sheetConv = readSheet(wb, "変換テーブル");
const sheetDk = readSheet(wb, "出来高算定手術等コード");
const sheetAge = readSheet(wb, "年齢、出生時体重等");
console.log("");

const D = {
  dpc: {}, cls: {}, lb: {}, br: {}, p1: {}, p2: {},
  si: {}, sl: [], icd: {}, icn: {}, sd: {}, sv: {},
  dk: {}, cn: {}, da: {}, pt: {},
};

// ── 2）分類名称 → D.cls ──
console.log("D.cls 生成中...");
for (let i = 2; i < sheetCls.length; i++) {
  const row = sheetCls[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const name = str(row[2]);
  if (!mdc || !cls || !name) continue;
  D.cls[mdc + cls] = name;
}
console.log(`  → ${Object.keys(D.cls).length} 件`);

// ── 3）病態等分類 + 5）年齢 → D.pt ──
// DPCコード7-8桁目: 7桁目=病態等分類condCode("x"=なし), 8桁目=年齢値("x"=なし)
console.log("D.pt 生成中...");
{
  // (A) 年齢シートから条件名="年齢"のクラスを抽出
  const ageMap = new Map();
  for (let i = 2; i < sheetAge.length; i++) {
    const row = sheetAge[i];
    const mdc = pad2(row[0]);
    const cls = str(row[1]);
    const condName = str(row[3]);
    if (!mdc || !cls || condName !== "年齢") continue;
    const fullCls = mdc + (cls.length < 4 ? cls.padStart(4, "0") : cls);
    const ranges = new Map();
    for (let j = 0; j < 5; j++) {
      const from = parseInt(str(row[4 + j * 3]));
      const to = parseInt(str(row[5 + j * 3]));
      const val = str(row[6 + j * 3]);
      if (isNaN(from) || isNaN(to) || val === "") continue;
      let label;
      if (to >= 999) label = `${from}歳以上`;
      else if (from === 0) label = `${to}歳未満`;
      else label = `${from}～${to}歳`;
      ranges.set(val, label);
    }
    if (ranges.size > 0) ageMap.set(fullCls, ranges);
  }

  // (B) 病態等分類シートから条件を抽出
  const condMap = new Map();
  for (let i = 2; i < sheetPt.length; i++) {
    const row = sheetPt[i];
    const mdc = pad2(row[0]);
    const cls = pad4(row[1]);
    if (!mdc || !cls) continue;
    const fullCls = mdc + cls;
    if (!condMap.has(fullCls)) condMap.set(fullCls, []);
    condMap.get(fullCls).push({
      condCode: str(row[2]),
      ageFrom: parseInt(str(row[4])) || 0,
      ageTo: parseInt(str(row[5])) || 999,
      kubunName: str(row[7]),
    });
  }

  // (C) 変換テーブルからpos67バリエーション収集
  const pos67Map = new Map();
  for (let i = 2; i < sheetConv.length; i++) {
    const code = str(sheetConv[i][1]);
    if (!code || code.length !== 14) continue;
    const fullCls = code.slice(0, 6);
    const pos67 = code.slice(6, 8);
    if (pos67 === "xx") continue;
    if (!pos67Map.has(fullCls)) pos67Map.set(fullCls, new Set());
    pos67Map.get(fullCls).add(pos67);
  }

  // (D) D.pt構築
  for (const [fullCls, ageRanges] of ageMap) {
    const pos67Set = pos67Map.get(fullCls);
    if (!pos67Set) continue;
    const conds = condMap.get(fullCls);
    const ptEntry = {};

    if (!conds) {
      for (const [val, label] of ageRanges) {
        const key = "x" + val;
        if (pos67Set.has(key)) ptEntry[key] = label;
      }
    } else {
      for (const pos67 of pos67Set) {
        const p6 = pos67[0];
        const p7 = pos67[1];
        const matched = conds.filter((c) => c.condCode === p6);
        let condLabel = "";
        if (matched.length === 1) {
          const c = matched[0];
          condLabel = c.kubunName || (c.ageTo < 999 ? `${c.ageTo}歳未満` : `${c.ageFrom}歳以上`);
        } else if (matched.length > 1) {
          condLabel = matched.map((c) => c.kubunName).filter(Boolean).join("／");
          if (!condLabel) condLabel = `${matched[0].ageFrom}歳以上`;
        }
        const ageLabel = p7 !== "x" ? ageRanges.get(p7) || "" : "";
        let label;
        if (condLabel && ageLabel) {
          label = `${condLabel}・${ageLabel}`;
        } else if (condLabel) {
          const ai = matched[0];
          label = ai && ai.ageFrom > 0 ? `${condLabel}・${ai.ageFrom}歳以上` : condLabel;
        } else {
          label = ageLabel;
        }
        if (label) ptEntry[pos67] = label;
      }
    }
    if (Object.keys(ptEntry).length > 0) D.pt[fullCls] = ptEntry;
  }
}
console.log(`  → ${Object.keys(D.pt).length} 件`);

// ── 4）ICD → D.icd, D.icn ──
console.log("D.icd, D.icn 生成中...");
for (let i = 2; i < sheetIcd.length; i++) {
  const row = sheetIcd[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const name = str(row[2]);
  const code = str(row[3]);
  if (!mdc || !cls || !code) continue;
  const fullCls = mdc + cls;
  if (!D.icd[fullCls]) D.icd[fullCls] = [];
  if (!D.icd[fullCls].includes(code)) D.icd[fullCls].push(code);
  if (name) D.icn[code] = name;
}
console.log(`  → D.icd: ${Object.keys(D.icd).length} 件, D.icn: ${Object.keys(D.icn).length} 件`);

// ── 6）手術 → D.si, D.sl, D.cn ──
console.log("D.si, D.sl, D.cn(手術) 生成中...");
const slMap = new Map();
D.cn["KKK0"] = "手術なし";
D.cn["KKK1"] = "定義テーブルにない手術";

for (let i = 2; i < sheetSurg.length; i++) {
  const row = sheetSurg[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const surgVal = pad2(row[5]);
  if (!mdc || !cls || !surgVal) continue;
  const fullCls = mdc + cls;
  for (let col = 7; col <= 15; col += 2) {
    const kcode = str(row[col]);
    if (!kcode) continue;
    const kname = str(row[col - 1]);
    const slKey = `${fullCls}_${surgVal}`;
    if (!slMap.has(slKey)) slMap.set(slKey, []);
    const arr = slMap.get(slKey);
    if (!arr.includes(kcode)) arr.push(kcode);
    if (kname && !D.cn[kcode]) D.cn[kcode] = kname;
  }
}

D.sl.push(["KKK0"]); // index 0
const slKeyToIndex = new Map();
const slContentToIndex = new Map();
slContentToIndex.set(JSON.stringify(["KKK0"]), 0);

for (const [slKey, codes] of slMap) {
  codes.sort();
  const serialized = JSON.stringify(codes);
  let idx;
  if (slContentToIndex.has(serialized)) {
    idx = slContentToIndex.get(serialized);
  } else {
    idx = D.sl.length;
    D.sl.push(codes);
    slContentToIndex.set(serialized, idx);
  }
  slKeyToIndex.set(slKey, idx);
}

for (const [slKey, idx] of slKeyToIndex) {
  const [fullCls, surgVal] = slKey.split("_");
  if (!D.si[fullCls]) D.si[fullCls] = {};
  D.si[fullCls][surgVal] = idx;
}

for (const fullCls of Object.keys(D.cls)) {
  if (!D.si[fullCls]) D.si[fullCls] = {};
  if (D.si[fullCls]["99"] === undefined) D.si[fullCls]["99"] = 0;
}

const kkk1Serialized = JSON.stringify(["KKK1"]);
let kkk1Idx;
if (slContentToIndex.has(kkk1Serialized)) {
  kkk1Idx = slContentToIndex.get(kkk1Serialized);
} else {
  kkk1Idx = D.sl.length;
  D.sl.push(["KKK1"]);
  slContentToIndex.set(kkk1Serialized, kkk1Idx);
}

console.log(`  → D.si: ${Object.keys(D.si).length} 件, D.sl: ${D.sl.length} 件`);

// ── 7）手術・処置等1 → D.p1, D.cn ──
console.log("D.p1, D.cn(処置等1) 生成中...");
for (let i = 2; i < sheetP1.length; i++) {
  const row = sheetP1[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const corrVal = str(row[2]);
  if (!mdc || !cls || !corrVal) continue;
  const fullCls = mdc + cls;
  if (!D.p1[fullCls]) D.p1[fullCls] = {};
  if (!D.p1[fullCls][corrVal]) D.p1[fullCls][corrVal] = [];
  for (const col of [6, 8]) {
    const code = str(row[col]);
    if (!code) continue;
    if (!D.p1[fullCls][corrVal].includes(code)) D.p1[fullCls][corrVal].push(code);
    const name = str(row[col - 1]);
    if (name && !D.cn[code]) D.cn[code] = name;
  }
}
console.log(`  → D.p1: ${Object.keys(D.p1).length} 件`);

// ── 8）手術・処置等2 → D.p2, D.cn ──
console.log("D.p2, D.cn(処置等2) 生成中...");
for (let i = 2; i < sheetP2.length; i++) {
  const row = sheetP2[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const corrVal = str(row[2]);
  if (!mdc || !cls || !corrVal) continue;
  const fullCls = mdc + cls;
  if (!D.p2[fullCls]) D.p2[fullCls] = {};
  if (!D.p2[fullCls][corrVal]) D.p2[fullCls][corrVal] = [];
  for (const col of [5, 7]) {
    const code = str(row[col]);
    if (!code) continue;
    if (!D.p2[fullCls][corrVal].includes(code)) D.p2[fullCls][corrVal].push(code);
    const name = str(row[col - 1]);
    if (name && !D.cn[code]) D.cn[code] = name;
  }
}
console.log(`  → D.p2: ${Object.keys(D.p2).length} 件`);

// ── 9）定義副傷病名 → D.sd ──
console.log("D.sd 生成中...");
for (let i = 2; i < sheetSd.length; i++) {
  const row = sheetSd[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const corrVal = str(row[2]);
  const icdCode = str(row[5]);
  if (!mdc || !cls || !corrVal || !icdCode) continue;
  const fullCls = mdc + cls;
  if (!D.sd[fullCls]) D.sd[fullCls] = {};
  if (!D.sd[fullCls][corrVal]) D.sd[fullCls][corrVal] = [];
  if (!D.sd[fullCls][corrVal].includes(icdCode)) D.sd[fullCls][corrVal].push(icdCode);
}
console.log(`  → D.sd: ${Object.keys(D.sd).length} 件`);

// ── 10-1~4）重症度等 → D.sv ──
console.log("D.sv 生成中...");

// 10-4）脳卒中の発症時期等
for (let i = 2; i < sheetSv4.length; i++) {
  const row = sheetSv4[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const corrVal = str(row[2]);
  const condName = str(row[5]);
  const label = str(row[7]);
  if (!mdc || !cls) continue;
  const fullCls = mdc + cls;
  if (!D.sv[fullCls]) D.sv[fullCls] = {};
  if (condName && !D.sv[fullCls].name) D.sv[fullCls].name = condName;
  if (label) D.sv[fullCls][corrVal] = label;
}

// 10-2）重症度等（手術等）
for (let i = 3; i < sheetSv2.length; i++) {
  const row = sheetSv2[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const condName = str(row[3]);
  if (!mdc || !cls) continue;
  const fullCls = mdc + cls;
  if (!D.sv[fullCls]) D.sv[fullCls] = {};
  if (condName && !D.sv[fullCls].name) D.sv[fullCls].name = condName;
  const label1 = str(row[4]);
  const val1 = str(row[5]);
  const label2 = str(row[6]);
  const val2 = str(row[7]);
  if (label1 && val1 !== "") D.sv[fullCls][val1] = label1;
  if (label2 && val2 !== "") D.sv[fullCls][val2] = label2;
}

// 10-1）JCS等
for (let i = 2; i < sheetSv1.length; i++) {
  const row = sheetSv1[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const condName = str(row[3]);
  if (!mdc || !cls) continue;
  const fullCls = mdc + cls;
  if (!D.sv[fullCls]) D.sv[fullCls] = {};
  if (condName && !D.sv[fullCls].name) D.sv[fullCls].name = condName;
  const from1 = parseInt(str(row[4])) || 0;
  const to1 = parseInt(str(row[5])) || 0;
  const val1 = str(row[6]);
  const from2 = parseInt(str(row[7])) || 0;
  const to2 = parseInt(str(row[8])) || 0;
  const val2 = str(row[9]);
  if (condName === "年齢") {
    if (to1 < 999 && to1 > 0) D.sv[fullCls][val1] = `${from1}歳以上${to1}歳未満`;
    else if (from1 > 0) D.sv[fullCls][val1] = `${from1}歳以上`;
    if (to2 < 999 && to2 > 0) D.sv[fullCls][val2] = `${from2}歳以上${to2}歳未満`;
    else if (from2 > 0) D.sv[fullCls][val2] = `${from2}歳以上`;
  } else {
    D.sv[fullCls][val1] = `${condName}${from1}以上${to1}未満`;
    D.sv[fullCls][val2] = `${condName}${from2}以上${to2}未満`;
  }
}

// 10-3）重症度等（重症・軽症）
for (let i = 2; i < sheetSv3.length; i++) {
  const row = sheetSv3[i];
  const mdc = pad2(row[0]);
  const cls = pad4(row[1]);
  const condName = str(row[3]);
  if (!mdc || !cls) continue;
  const fullCls = mdc + cls;
  if (!D.sv[fullCls]) D.sv[fullCls] = {};
  if (condName && !D.sv[fullCls].name) D.sv[fullCls].name = condName;
  for (const [fromCol, toCol, valCol] of [[4, 5, 6], [7, 8, 9], [10, 11, 12]]) {
    const from = parseInt(str(row[fromCol])) || 0;
    const to = parseInt(str(row[toCol])) || 0;
    const val = str(row[valCol]);
    if (val !== "" && to > 0) D.sv[fullCls][val] = `${condName}(${from}〜${to - 1})`;
  }
}
console.log(`  → D.sv: ${Object.keys(D.sv).length} 件`);

// ── 13）出来高算定手術等コード → D.dk ──
console.log("D.dk 生成中...");
for (let i = 2; i < sheetDk.length; i++) {
  const row = sheetDk[i];
  const code = str(row[1]);
  const name = str(row[2]);
  if (!code || !name) continue;
  D.dk[code] = name;
}
console.log(`  → D.dk: ${Object.keys(D.dk).length} 件`);

// ── 12）変換テーブル → D.dpc（ベース値）, D.br ──
console.log("D.dpc, D.br 生成中（変換テーブル）...");
const convMap = new Map();
for (let i = 2; i < sheetConv.length; i++) {
  const row = sheetConv[i];
  const dpcCode = str(row[1]);
  if (!dpcCode || dpcCode.length !== 14) continue;
  if (!convMap.has(dpcCode)) {
    convMap.set(dpcCode, {
      mdc: pad2(row[3]),
      cls: pad4(row[4]),
      dek: str(row[2]),
      surgVal: pad2(row[14]),
      p1Val: str(row[15]),
      p2Val: str(row[16]),
      sdVal: str(row[17]),
    });
  }
}
console.log(`  変換テーブルから ${convMap.size} DPCコード抽出`);

// D.br
const brGroups = new Map();
for (const [, info] of convMap) {
  const key = `${info.mdc}${info.cls}_${info.surgVal}`;
  if (!brGroups.has(key)) brGroups.set(key, { p1: new Set(), p2: new Set(), sd: new Set() });
  const g = brGroups.get(key);
  g.p1.add(info.p1Val);
  g.p2.add(info.p2Val);
  g.sd.add(info.sdVal);
}
for (const [key, g] of brGroups) {
  const [fullCls, surgVal] = key.split("_");
  const branches = {};
  if (g.p1.size > 1) branches["1"] = 1;
  if (g.p2.size > 1) branches["2"] = 1;
  if (g.sd.size > 1) branches["s"] = 1;
  if (Object.keys(branches).length > 0) {
    if (!D.br[fullCls]) D.br[fullCls] = {};
    D.br[fullCls][surgVal] = branches;
  }
}
console.log(`  → D.br: ${Object.keys(D.br).length} 件`);

// ── 11）診断群分類点数表 → D.dpc（日数・点数）+ D.lb ──
console.log("D.dpc, D.lb 生成中（点数表）...");

let scoreHeaderRow = 2;
for (let i = 0; i < Math.min(10, sheetScore.length); i++) {
  const row = sheetScore[i];
  if (row && row.some((v) => str(v).includes("診断群分類番号"))) {
    scoreHeaderRow = i;
    break;
  }
}
const scoreDataStart = scoreHeaderRow + 2;

for (let i = scoreDataStart; i < sheetScore.length; i++) {
  const row = sheetScore[i];
  const dpcCode = str(row[1]);
  if (!dpcCode || dpcCode.length !== 14) continue;

  const d1 = parseInt(str(row[8])) || 0;
  const d2 = parseInt(str(row[9])) || 0;
  const d3 = parseInt(str(row[10])) || 0;
  const pt1 = parseInt(str(row[11])) || 0;
  const pt2 = parseInt(str(row[12])) || 0;
  const pt3 = parseInt(str(row[13])) || 0;

  const conv = convMap.get(dpcCode);
  if (conv) {
    D.dpc[dpcCode] = [
      conv.mdc, conv.cls, conv.dek, conv.surgVal,
      conv.p1Val, conv.p2Val, conv.sdVal,
      d1, d2, d3, pt1, pt2, pt3,
    ];

    const fullCls = conv.mdc + conv.cls;
    if (!D.lb[fullCls]) D.lb[fullCls] = {};

    const surgName = str(row[3]);
    if (surgName) {
      if (!D.lb[fullCls].o) D.lb[fullCls].o = {};
      if (!D.lb[fullCls].o[conv.surgVal]) D.lb[fullCls].o[conv.surgVal] = surgName;
    }

    const p1Name = str(row[4]);
    if (p1Name) {
      if (!D.lb[fullCls]["1"]) D.lb[fullCls]["1"] = {};
      if (!D.lb[fullCls]["1"][conv.p1Val]) D.lb[fullCls]["1"][conv.p1Val] = p1Name;
    }

    const p2Name = str(row[5]);
    if (p2Name) {
      if (!D.lb[fullCls]["2"]) D.lb[fullCls]["2"] = {};
      if (!D.lb[fullCls]["2"][conv.p2Val]) D.lb[fullCls]["2"][conv.p2Val] = p2Name;
    }

    const sdName = str(row[6]);
    if (sdName) {
      if (!D.lb[fullCls].s) D.lb[fullCls].s = {};
      if (!D.lb[fullCls].s[conv.sdVal]) D.lb[fullCls].s[conv.sdVal] = sdName;
    }

    const svName = str(row[7]);
    if (svName) {
      if (!D.lb[fullCls].v) D.lb[fullCls].v = {};
      D.lb[fullCls].v[svName] = svName;
    }
  }
}

// 変換テーブルにあるが点数表にないDPC（出来高のみ等）を補完
for (const [dpcCode, conv] of convMap) {
  if (D.dpc[dpcCode]) continue;
  D.dpc[dpcCode] = [
    conv.mdc, conv.cls, conv.dek, conv.surgVal,
    conv.p1Val, conv.p2Val, conv.sdVal,
    0, 0, 0, 0, 0, 0,
  ];
}
console.log(`  → D.dpc: ${Object.keys(D.dpc).length} 件, D.lb: ${Object.keys(D.lb).length} 件`);

// ── D.da（薬剤別名）の処理 ──
console.log("D.da 生成中...");
if (keepDa) {
  try {
    const existingData = readFileSync(join(ROOT, "src", "data.js"), "utf-8");
    const match = existingData.match(/export\s+const\s+D\s*=\s*(\{[\s\S]+\});?\s*$/);
    if (match) {
      const existingD = JSON.parse(match[1]);
      if (existingD.da) {
        D.da = existingD.da;
        console.log(`  → 既存 D.da を保持: ${Object.keys(D.da).length} 件`);
      }
    }
  } catch (e) {
    console.warn(`  [WARN] 既存 src/data.js の読み込みに失敗: ${e.message}`);
  }
} else {
  console.log("  → D.da は空で生成（--keep-da で既存データをマージ可能）");
}

// ── 手術(97) D.si 補完 ──
for (const [, conv] of convMap) {
  const fullCls = conv.mdc + conv.cls;
  if (conv.surgVal === "97") {
    if (!D.si[fullCls]) D.si[fullCls] = {};
    if (D.si[fullCls]["97"] === undefined) D.si[fullCls]["97"] = kkk1Idx;
  }
}

// ── 検証 ──
console.log("\n── 検証 ──");
const stats = {
  dpc: Object.keys(D.dpc).length,
  cls: Object.keys(D.cls).length,
  lb: Object.keys(D.lb).length,
  br: Object.keys(D.br).length,
  p1: Object.keys(D.p1).length,
  p2: Object.keys(D.p2).length,
  si: Object.keys(D.si).length,
  sl: D.sl.length,
  icd: Object.keys(D.icd).length,
  icn: Object.keys(D.icn).length,
  sd: Object.keys(D.sd).length,
  sv: Object.keys(D.sv).length,
  dk: Object.keys(D.dk).length,
  cn: Object.keys(D.cn).length,
  da: Object.keys(D.da).length,
  pt: Object.keys(D.pt).length,
};

console.log("件数サマリー:");
for (const [key, count] of Object.entries(stats)) {
  console.log(`  D.${key.padEnd(4)}: ${String(count).padStart(6)} 件`);
}

let errors = 0;
const warn = (msg) => { errors++; console.error(`  [ERROR] ${msg}`); };

for (const fullCls of Object.keys(D.cls)) {
  if (!D.icd[fullCls]) warn(`D.icd にキー「${fullCls}」がありません`);
}
for (const [fullCls, surgMap] of Object.entries(D.si)) {
  for (const [surgVal, idx] of Object.entries(surgMap)) {
    if (idx >= D.sl.length) warn(`D.si[${fullCls}][${surgVal}]=${idx} が D.sl 範囲外`);
  }
}
for (const [code, arr] of Object.entries(D.dpc)) {
  if (arr.length !== 13) warn(`D.dpc[${code}] の長さが ${arr.length}（期待値: 13）`);
}
for (const [code, d] of Object.entries(D.dpc)) {
  if (d[2] === "0" || d[2] === 0) continue;
  if (d[7] && d[8] && d[7] > d[8]) warn(`日数逆転 I>II: ${code}`);
  if (d[8] && d[9] && d[8] > d[9]) warn(`日数逆転 II>III: ${code}`);
}

if (errors === 0) {
  console.log("  整合性チェック OK");
} else {
  console.error(`  ${errors} 件のエラー`);
}

// ── 出力 ──
if (dryRun) {
  console.log("\n[dry-run] ファイル出力はスキップされました");
} else {
  console.log(`\n出力中: ${argOut}`);
  const output = `export const D=${JSON.stringify(D)};\n`;
  writeFileSync(argOut, output, "utf-8");
  const sizeMB = (Buffer.byteLength(output, "utf-8") / 1024 / 1024).toFixed(2);
  console.log(`  → ${sizeMB} MB`);
}

console.log("\n完了!");
if (Object.keys(D.da).length === 0) {
  console.log(
    "\n[NOTE] D.da（薬剤別名）が空です。\n" +
    "  既存のデータを保持するには --keep-da オプションを使用してください:\n" +
    "    node scripts/generate-data.mjs --keep-da"
  );
}
