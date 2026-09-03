#!/usr/bin/env node
/**
 * DPC電子点数表 Excel → src/data.js 変換スクリプト
 *
 * 使い方:
 *   1. database/ フォルダに厚生労働省の DPC電子点数表 Excel（1ファイル）を配置
 *   2. node scripts/generate-data.mjs
 *
 * ファイル名は改定ごとに変わるため、シート名で自動検出します。
 * 複数の電子点数表が見つかった場合は有効期間（開始日）が最も新しいものを使います。
 *
 * オプション:
 *   --file <path>     電子点数表Excelのパスを直接指定
 *   --out <path>      出力先（デフォルト: src/data.js）
 *   --as-of YYYYMMDD  有効期間の基準日（デフォルト: Excel内の最新更新日）
 *   --aliases <path>  薬剤別名JSON（デフォルト: database/drug-aliases.json）
 *   --dry-run         ファイル出力せず件数のみ表示
 *   --keep-da         （互換用・無視）薬剤別名は常に database/drug-aliases.json から読み込みます
 *
 * データ構造（src/data.js の D）は README.md「データ構造」を参照。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── 定数 ──
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DB_DIR = join(ROOT, "database");
const DEFAULT_OUT = join(ROOT, "src", "data.js");
const DEFAULT_ALIASES = join(DB_DIR, "drug-aliases.json");

// 電子点数表と判定するために必須のシート（番号・空白を除いた名称）
const IDENTIFIER_SHEETS = ["診断群分類点数表", "変換テーブル", "分類名称", "ＩＣＤ", "手術"];

// 特殊コード
const CODE_NO_SURGERY = "KKK0"; // 手術なし
const CODE_OTHER_SURGERY = "KKK1"; // 定義テーブルにない手術
const ICD_M_WILDCARD = "M!!!!"; // ＩＣＤテーブルにないＭコード（→071030）
const X = "x"; // DPCコード中の「該当なし（分岐なし）」

// ── 引数解析 ──
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const argFile = getArg("--file");
const argOut = getArg("--out") || DEFAULT_OUT;
const argAsOf = getArg("--as-of");
const argAliases = getArg("--aliases") || DEFAULT_ALIASES;
const dryRun = args.includes("--dry-run");

if (argAsOf && !/^\d{8}$/.test(argAsOf)) {
  console.error(`[ERROR] --as-of は YYYYMMDD 形式で指定してください: ${argAsOf}`);
  process.exit(1);
}

// ── ユーティリティ ──
const str = (v) => (v == null ? "" : String(v).trim());
const pad2 = (v) => str(v).padStart(2, "0");
const pad4 = (v) => str(v).padStart(4, "0");
const toInt = (v, fallback = 0) => {
  const n = parseInt(str(v), 10);
  return Number.isNaN(n) ? fallback : n;
};
const compact = (s) => str(s).replace(/[\s　]/g, "");
const isDate8 = (s) => /^\d{8}$/.test(s) && s !== "99999999" && s !== "00000000";

/** 漢数字・全角数字を整数に変換（「八」「十二」「２８」など） */
function kanjiToInt(s) {
  const digits = "〇一二三四五六七八九";
  s = String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch === "十") { total += (cur || 1) * 10; cur = 0; }
    else { const d = digits.indexOf(ch); if (d >= 0) cur = d; }
  }
  return total + cur;
}

/** シート名から先頭の番号（「６）」「10－1）」「13)」など）を除いた本体名 */
function sheetBody(name) {
  return compact(name).replace(/^[0-9０-９]+(?:[－\-][0-9０-９]+)?[）)]/, "");
}

function findSheetName(wb, keyword, { optional = false } = {}) {
  const kw = compact(keyword);
  const exact = wb.SheetNames.find((n) => sheetBody(n) === kw);
  if (exact) return exact;
  const partial = wb.SheetNames.find((n) => sheetBody(n).includes(kw));
  if (partial) return partial;
  if (optional) return null;
  console.error(`[ERROR] シート「${keyword}」が見つかりません`);
  console.error("  利用可能なシート:", wb.SheetNames.join(", "));
  process.exit(1);
}

function readSheet(wb, keyword, opts = {}) {
  const name = findSheetName(wb, keyword, opts);
  if (!name) {
    console.log(`  （${keyword}: シートなし）`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  console.log(`  ${name}: ${rows.length} 行`);
  return rows;
}

/**
 * 「変更区分」「有効期間（開始日・終了日）」「更新日」列を見出しから特定する。
 * 見出し行が見つからないシートには null を返す。
 */
function findMetaCols(rows) {
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const r = rows[i] || [];
    const chg = r.findIndex((v) => compact(v).includes("変更区分"));
    const per = r.findIndex((v) => compact(v).includes("有効期間"));
    if (chg >= 0 && per >= 0) {
      const upd = r.findIndex((v) => compact(v).includes("更新日"));
      return { headerRow: i, chg, start: per, end: per + 1, upd: upd >= 0 ? upd : per + 2 };
    }
  }
  return null;
}

/**
 * 有効なデータ行のみを返す。
 *  - 見出し行・空行（変更区分が1桁の数字でない行）を除外
 *  - 変更区分 1（抹消）を除外
 *  - 終了日が基準日より前の行（失効済み）を除外
 */
function effectiveRows(rows, asOf, stats) {
  const meta = findMetaCols(rows);
  if (!meta) return rows.slice(2);
  const out = [];
  for (let i = meta.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const chg = str(r[meta.chg]);
    if (!/^\d$/.test(chg)) continue;
    if (chg === "1") { stats.deleted++; continue; }
    const end = str(r[meta.end]);
    if (isDate8(end) && end < asOf) { stats.expired++; continue; }
    const start = str(r[meta.start]);
    if (isDate8(start) && start > asOf) { stats.future++; continue; } // 基準日より後に開始する行（--as-of で過去時点を再現する場合）も除外
    out.push(r);
  }
  return out;
}

/** 全シートの開始日・更新日の最大値（= Excelの最終更新日） */
function detectAsOf(sheets) {
  let max = "";
  for (const rows of sheets) {
    const meta = findMetaCols(rows);
    if (!meta) continue;
    for (let i = meta.headerRow + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      for (const col of [meta.start, meta.upd]) {
        const v = str(r[col]);
        if (isDate8(v) && v > max) max = v;
      }
    }
  }
  return max;
}

/** 範囲ラベル（「15歳未満」「ＪＣＳ10以上」「1000g以上1500g未満」など） */
function rangeLabel(prefix, unit, from, to, max) {
  const f = toInt(from), t = toInt(to, max);
  const u = unit || "";
  if (f <= 0 && t < max) return `${prefix}${t}${u}未満`;
  if (t >= max) return `${prefix}${f}${u}以上`;
  return `${prefix}${f}${u}以上${t}${u}未満`;
}

// 「５）年齢、出生時体重等」条件区分 → ラベル書式
const COND_FORMAT = {
  "1": { prefix: "", unit: "歳", max: 999 },
  "2": { prefix: "ＪＣＳ", unit: "", max: 999 },
  "3": { prefix: "出生時体重", unit: "g", max: 9999 },
  "4": { prefix: "Burn Index", unit: "", max: 999 },
  "5": { prefix: "ＧＡＦ", unit: "", max: 999 },
  "6": { prefix: "月齢", unit: "か月", max: 999 },
  "7": { prefix: "妊娠", unit: "週", max: 999 },
  "8": { prefix: "分娩時出血量", unit: "ml", max: 100000 },
};

// ── ファイル検出 ──
function isScoreTableWorkbook(path) {
  try {
    const wb = XLSX.readFile(path, { bookSheets: true });
    const bodies = wb.SheetNames.map(sheetBody);
    return IDENTIFIER_SHEETS.every((id) => bodies.some((b) => b.includes(compact(id))));
  } catch {
    return false;
  }
}

function detectFile() {
  if (argFile) {
    if (!existsSync(argFile)) {
      console.error(`[ERROR] 指定ファイルが見つかりません: ${argFile}`);
      process.exit(1);
    }
    return resolve(argFile);
  }
  if (!existsSync(DB_DIR)) {
    console.error(`[ERROR] database/ ディレクトリが見つかりません。\n  → 厚生労働省の電子点数表Excelを database/ に配置してください。`);
    process.exit(1);
  }
  const xlsxFiles = readdirSync(DB_DIR).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"));
  const candidates = xlsxFiles.map((f) => join(DB_DIR, f)).filter(isScoreTableWorkbook);
  if (candidates.length === 0) {
    console.error(
      `[ERROR] database/ 内に DPC電子点数表の Excel が見つかりません。\n` +
      `  → --file オプションでパスを直接指定するか、database/ に厚生労働省の電子点数表Excelを配置してください。\n` +
      `  検索対象: ${xlsxFiles.join(", ") || "(xlsxファイルなし)"}`
    );
    process.exit(1);
  }
  if (candidates.length === 1) {
    console.log(`[自動検出] ${basename(candidates[0])}`);
    return candidates[0];
  }
  // 複数ある場合は「分類名称」シートの開始日が最も新しいものを採用
  const scored = candidates.map((p) => {
    const wb = XLSX.readFile(p);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[findSheetName(wb, "分類名称")], { header: 1 });
    const meta = findMetaCols(rows);
    let start = "";
    if (meta) for (const r of rows.slice(meta.headerRow + 1)) { const v = str(r?.[meta.start]); if (isDate8(v) && v > start) start = v; }
    return { p, start };
  });
  scored.sort((a, b) => (a.start < b.start ? 1 : -1));
  console.log(`[自動検出] 複数の電子点数表を検出。最新版を使用します:`);
  for (const s of scored) console.log(`    ${s.start || "????????"}  ${basename(s.p)}${s === scored[0] ? "  ← 使用" : ""}`);
  console.log(`  [NOTE] 旧版は database/ から削除することを推奨します（npm run validate:data が旧版を拾う恐れがあります）`);
  return scored[0].p;
}

// ── メイン ──
const excelPath = detectFile();
console.log(`\n読み込み中: ${excelPath}`);
const wb = XLSX.readFile(excelPath);
console.log(`シート数: ${wb.SheetNames.length}\n`);

console.log("シート読み込み:");
const raw = {
  dummy: readSheet(wb, "ダミーコード一覧", { optional: true }),
  cls: readSheet(wb, "分類名称"),
  pt: readSheet(wb, "病態等分類"),
  icd: readSheet(wb, "ＩＣＤ"),
  age: readSheet(wb, "年齢、出生時体重等"),
  surg: readSheet(wb, "手術"),
  p1: readSheet(wb, "手術・処置等１"),
  p2: readSheet(wb, "手術・処置等２"),
  sd: readSheet(wb, "定義副傷病名"),
  sv1: readSheet(wb, "重症度等（ＪＣＳ等）"),
  sv2: readSheet(wb, "重症度等（手術等）"),
  sv3: readSheet(wb, "重症度等（重症・軽症）"),
  sv4: readSheet(wb, "重症度等（脳卒中の発症時期等）"),
  score: readSheet(wb, "診断群分類点数表"),
  conv: readSheet(wb, "変換テーブル"),
  dk: readSheet(wb, "出来高算定手術等コード", { optional: true }),
  cc: readSheet(wb, "CCPM対応", { optional: true }),
};
console.log("");

// ── 有効期間の基準日 ──
const detectedAsOf = detectAsOf(Object.values(raw));
const asOf = argAsOf || detectedAsOf || "00000000";
console.log(`有効期間の基準日（as-of）: ${asOf}${argAsOf ? "（指定）" : "（Excel内の最新更新日）"}`);
const rowStats = { deleted: 0, expired: 0, future: 0 };
const S = {};
for (const [k, rows] of Object.entries(raw)) S[k] = k === "dummy" ? rows : effectiveRows(rows, asOf, rowStats);
console.log(`  除外: 抹消 ${rowStats.deleted} 行, 失効 ${rowStats.expired} 行, 基準日より後に開始 ${rowStats.future} 行\n`);

const D = {
  meta: {}, dpc: {}, cls: {}, lb: {}, br: {}, p1: {}, p2: {}, pc: {},
  si: {}, sl: [], icd: {}, icn: {}, sd: {}, sv: {}, dk: {}, dx: { dr: [], pt: [] },
  cn: {}, da: {}, dn: {}, pn: {}, pt: {}, cc: {}, cv: {},
};
const warnings = [];
const warn = (msg) => warnings.push(msg);

// ── 2）分類名称 → D.cls ──
console.log("D.cls 生成中...");
for (const row of S.cls) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), name = str(row[2]);
  if (!mdc || !cls || !name) continue;
  D.cls[mdc + cls] = name;
}
console.log(`  → ${Object.keys(D.cls).length} 件`);

// ── 4）ＩＣＤ → D.icd, D.icn ──
console.log("D.icd, D.icn 生成中...");
for (const row of S.icd) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), name = str(row[2]), code = str(row[3]);
  if (!mdc || !cls || !code) continue;
  const fullCls = mdc + cls;
  if (!D.icd[fullCls]) D.icd[fullCls] = [];
  if (!D.icd[fullCls].includes(code)) D.icd[fullCls].push(code);
  if (name) D.icn[code] = name;
}
console.log(`  → D.icd: ${Object.keys(D.icd).length} 件, D.icn: ${Object.keys(D.icn).length} 件`);

// ── 6）手術 → D.si, D.sl, D.cn ──
// 「＋（and）」の組み合わせ手術は複数列に分解されているため "K1+K2" 形式の1要素として保持する
console.log("D.si, D.sl, D.cn(手術) 生成中...");
D.cn[CODE_NO_SURGERY] = "手術なし";
D.cn[CODE_OTHER_SURGERY] = "定義テーブルにない手術";
const slMap = new Map();
let surgComboRows = 0;
for (const row of S.surg) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), surgVal = pad2(row[5]);
  if (!mdc || !cls || !surgVal) continue;
  const codes = [], names = [];
  for (let col = 7; col <= 15; col += 2) {
    const kcode = str(row[col]);
    if (!kcode) continue;
    codes.push(kcode);
    names.push(str(row[col - 1]));
    if (names[names.length - 1] && !D.cn[kcode]) D.cn[kcode] = names[names.length - 1];
  }
  if (codes.length === 0) continue;
  const entry = codes.join("+");
  if (codes.length > 1) {
    surgComboRows++;
    if (!D.cn[entry]) D.cn[entry] = codes.map((c, i) => names[i] || D.cn[c] || c).join("＋");
  }
  const slKey = `${mdc}${cls}_${surgVal}`;
  if (!slMap.has(slKey)) slMap.set(slKey, []);
  const arr = slMap.get(slKey);
  if (!arr.includes(entry)) arr.push(entry);
}

D.sl.push([CODE_NO_SURGERY]); // index 0 = 手術なし
const slContentToIndex = new Map([[JSON.stringify([CODE_NO_SURGERY]), 0]]);
const slKeyToIndex = new Map();
for (const [slKey, codes] of slMap) {
  codes.sort();
  const serialized = JSON.stringify(codes);
  let idx = slContentToIndex.get(serialized);
  if (idx === undefined) {
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
let kkk1Idx = slContentToIndex.get(JSON.stringify([CODE_OTHER_SURGERY]));
if (kkk1Idx === undefined) {
  kkk1Idx = D.sl.length;
  D.sl.push([CODE_OTHER_SURGERY]);
  slContentToIndex.set(JSON.stringify([CODE_OTHER_SURGERY]), kkk1Idx);
}
console.log(`  → D.si: ${Object.keys(D.si).length} 件, D.sl: ${D.sl.length} 件（組み合わせ手術 ${surgComboRows} 行）`);

// ── 7）手術・処置等１ → D.p1, D.pc, D.cn ──
console.log("D.p1, D.pc, D.cn(処置等1) 生成中...");
function addProcRow(target, fullCls, corrVal, row, nameCols) {
  const codes = [], names = [];
  for (const col of nameCols) {
    const code = str(row[col]);
    if (!code) continue;
    codes.push(code);
    names.push(str(row[col - 1]));
    if (names[names.length - 1] && !D.cn[code]) D.cn[code] = names[names.length - 1];
  }
  if (codes.length === 0) return null;
  const entry = codes.join("+");
  if (codes.length > 1 && !D.cn[entry]) D.cn[entry] = codes.map((c, i) => names[i] || D.cn[c] || c).join("＋");
  if (!target[fullCls]) target[fullCls] = {};
  if (!target[fullCls][corrVal]) target[fullCls][corrVal] = [];
  if (!target[fullCls][corrVal].includes(entry)) target[fullCls][corrVal].push(entry);
  return entry;
}
for (const row of S.p1) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), corrVal = str(row[2]);
  if (!mdc || !cls || !corrVal) continue;
  const fullCls = mdc + cls;
  const entry = addProcRow(D.p1, fullCls, corrVal, row, [6, 8]);
  const surgCond = str(row[4]); // 手術との組み合わせ条件
  if (entry && surgCond) {
    if (!D.pc[fullCls]) D.pc[fullCls] = {};
    if (!D.pc[fullCls][entry]) D.pc[fullCls][entry] = [];
    if (!D.pc[fullCls][entry].includes(surgCond)) D.pc[fullCls][entry].push(surgCond);
  }
}
console.log(`  → D.p1: ${Object.keys(D.p1).length} 件, D.pc: ${Object.keys(D.pc).length} 件`);

// ── 8）手術・処置等２ → D.p2, D.cn ──
console.log("D.p2, D.cn(処置等2) 生成中...");
for (const row of S.p2) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), corrVal = str(row[2]);
  if (!mdc || !cls || !corrVal) continue;
  addProcRow(D.p2, mdc + cls, corrVal, row, [5, 7]);
}
console.log(`  → D.p2: ${Object.keys(D.p2).length} 件`);

// ── 9）定義副傷病名 → D.sd ──
// 副傷病フラグ 1: 手術あり・なし共通(a) / 2: 手術なしの場合(n) / 3: 手術ありの場合(s)
console.log("D.sd 生成中...");
const SD_FLAG_KEY = { "1": "a", "2": "n", "3": "s" };
for (const row of S.sd) {
  const mdc = pad2(row[0]), cls = pad4(row[1]), corrVal = str(row[2]), flag = str(row[3]), icdCode = str(row[5]);
  if (!mdc || !cls || !corrVal || !icdCode) continue;
  const key = SD_FLAG_KEY[flag] || "a";
  if (!SD_FLAG_KEY[flag]) warn(`定義副傷病: 未知のフラグ「${flag}」 (${mdc}${cls} ${icdCode}) → 共通扱い`);
  const fullCls = mdc + cls;
  if (!D.sd[fullCls]) D.sd[fullCls] = {};
  if (!D.sd[fullCls][corrVal]) D.sd[fullCls][corrVal] = {};
  const e = D.sd[fullCls][corrVal];
  if (!e[key]) e[key] = [];
  if (!e[key].includes(icdCode)) e[key].push(icdCode);
  if (str(row[4]) && !D.icn[icdCode]) D.icn[icdCode] = str(row[4]);
}
console.log(`  → D.sd: ${Object.keys(D.sd).length} 件`);

// ── 12）変換テーブル → 包括フラグ, D.cv（対応コード→DPC桁の写像） ──
// 変換テーブルは「診断群分類を決定するために使用する」正本。同一DPCコードに複数の対応コードが
// 写像される分類（例: 050050 手術02 の処置等1 = 0/1/2 → 桁0「なし、１,２あり」）があるため、
// 対応コード ≠ 桁 となる組み合わせを D.cv[cls][手術区分][種別][対応コード] = 桁 として保持する。
console.log("変換テーブル読み込み中...");
const convDek = new Map(); // code → "0"/"1"
const CV_COLS = [["1", 15, 10], ["2", 16, 11], ["s", 17, 12]]; // [種別, 変換テーブル列, DPCコード桁位置]
let cvPairs = 0;
for (const row of S.conv) {
  const code = str(row[1]);
  if (code.length !== 14) continue;
  const dek = str(row[2]);
  if (!convDek.has(code)) convDek.set(code, dek === "0" ? "0" : "1");
  else if (convDek.get(code) !== (dek === "0" ? "0" : "1")) warn(`変換テーブル: 包括フラグが行間で不一致 ${code}`);
  const cls = code.slice(0, 6), surg = code.slice(8, 10);
  const surgCol = str(row[14]);
  if (surgCol && surgCol !== "a" && surg !== "xx" && surgCol !== surg) warn(`変換テーブル: 手術の対応コード ${surgCol} がDPC桁 ${surg} と異なります ${code}`);
  for (const [type, col, pos] of CV_COLS) {
    const corr = str(row[col]);
    const digit = code[pos];
    if (corr === "" || corr === "a" || digit === X || corr === digit) continue;
    if (!D.cv[cls]) D.cv[cls] = {};
    if (!D.cv[cls][surg]) D.cv[cls][surg] = {};
    if (!D.cv[cls][surg][type]) D.cv[cls][surg][type] = {};
    const prev = D.cv[cls][surg][type][corr];
    if (prev && prev !== digit) warn(`変換テーブル: 対応コード ${corr} が複数の桁 (${prev}/${digit}) に写像 ${code}`);
    if (!prev) { D.cv[cls][surg][type][corr] = digit; cvPairs++; }
  }
}
console.log(`  → ${convDek.size} DPCコード, D.cv: ${Object.keys(D.cv).length} 分類 / 縮約 ${cvPairs} 組`);

// ── 11）診断群分類点数表 → D.dpc, D.lb, D.br（＋条件・重症度ラベルの元） ──
console.log("D.dpc, D.lb, D.br 生成中（点数表）...");
const scoreMeta = findMetaCols(raw.score);
const scoreRows = S.score.filter((r) => str(r[1]).length === 14);
const clsPosLabels = new Map(); // `${cls}_${pos78}` → 傷病名の括弧内（公式の条件ラベル）
const svLabels = new Map(); // cls → {digit → 重症度等ラベル}
const lbCollect = { "1": new Map(), "2": new Map(), s: new Map() }; // `${cls}|${digit}` → Map(surgVal → label)
for (const row of scoreRows) {
  const code = str(row[1]);
  const cls = code.slice(0, 6);
  if (!D.cls[cls]) { warn(`点数表: 分類名称にない分類 ${code}`); continue; }
  const surg = code.slice(8, 10), p1 = code[10], p2 = code[11], sd = code[12], sev = code[13];
  const d1 = toInt(row[8]), d2 = toInt(row[9]), d3 = toInt(row[10]);
  const pt1 = toInt(row[11]), pt2 = toInt(row[12]), pt3 = toInt(row[13]);
  const dek = convDek.has(code) ? convDek.get(code) : (pt1 > 0 ? "1" : "0");
  if (!convDek.has(code)) warn(`点数表: 変換テーブルにないDPC ${code}（包括フラグを点数から推定）`);
  D.dpc[code] = [code.slice(0, 2), code.slice(2, 6), dek, surg, p1, p2, sd, d1, d2, d3, pt1, pt2, pt3];

  // 分岐の有無（コードの桁が x でなければ分岐あり）
  if (!D.br[cls]) D.br[cls] = {};
  if (!D.br[cls][surg]) D.br[cls][surg] = {};
  if (p1 !== X) D.br[cls][surg]["1"] = 1;
  if (p2 !== X) D.br[cls][surg]["2"] = 1;
  if (sd !== X) D.br[cls][surg]["s"] = 1;

  // ラベル
  if (!D.lb[cls]) D.lb[cls] = {};
  const surgName = str(row[3]);
  if (surg !== "xx" && surgName) {
    if (!D.lb[cls].o) D.lb[cls].o = {};
    if (!D.lb[cls].o[surg]) D.lb[cls].o[surg] = surgName;
  }
  const collect = (t, digit, label) => {
    if (digit === X || !label) return;
    const k = `${cls}|${digit}`;
    if (!lbCollect[t].has(k)) lbCollect[t].set(k, new Map());
    lbCollect[t].get(k).set(surg, label);
  };
  collect("1", p1, str(row[4]));
  collect("2", p2, str(row[5]));
  collect("s", sd, str(row[6]));
  const sevName = str(row[7]);
  if (sev !== X && sevName) {
    if (!svLabels.has(cls)) svLabels.set(cls, {});
    if (!svLabels.get(cls)[sev]) svLabels.get(cls)[sev] = sevName;
    if (!D.lb[cls].v) D.lb[cls].v = {};
    if (!D.lb[cls].v[sev]) D.lb[cls].v[sev] = sevName;
  }
  // 条件（7-8桁目）: 傷病名が「分類名（条件）」形式なら括弧内を公式ラベルとして採用
  const pos78 = code.slice(6, 8);
  if (pos78 !== "xx") {
    const k = `${cls}_${pos78}`;
    const name = str(row[2]);
    const base = D.cls[cls];
    if (!clsPosLabels.has(k) && name.startsWith(base) && name.length > base.length) {
      const suffix = name.slice(base.length).replace(/^[（(]/, "").replace(/[）)]$/, "").trim();
      if (suffix) clsPosLabels.set(k, suffix);
    }
  }
}
// 変換テーブルにあるが点数表にないDPCを補完（通常は無い）
for (const [code, dek] of convDek) {
  if (D.dpc[code]) continue;
  warn(`変換テーブル: 点数表にないDPC ${code}（日数・点数0で補完）`);
  D.dpc[code] = [code.slice(0, 2), code.slice(2, 6), dek, code.slice(8, 10), code[10], code[11], code[12], 0, 0, 0, 0, 0, 0];
}
// 処置等1/2・副傷病ラベル: 分類×桁ごとの代表ラベル + 手術区分別の例外（"1:02" 等のキー）
for (const [t, map] of Object.entries(lbCollect)) {
  for (const [k, bySurg] of map) {
    const [cls, digit] = k.split("|");
    const counts = new Map();
    for (const label of bySurg.values()) counts.set(label, (counts.get(label) || 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (!D.lb[cls][t]) D.lb[cls][t] = {};
    D.lb[cls][t][digit] = main;
    for (const [surg, label] of bySurg) {
      if (label === main) continue;
      const key = `${t}:${surg}`;
      if (!D.lb[cls][key]) D.lb[cls][key] = {};
      D.lb[cls][key][digit] = label;
    }
  }
}
console.log(`  → D.dpc: ${Object.keys(D.dpc).length} 件, D.lb: ${Object.keys(D.lb).length} 件, D.br: ${Object.keys(D.br).length} 件`);

// 97（定義テーブルにない手術）の D.si 補完
for (const [, info] of Object.entries(D.dpc)) {
  const fullCls = info[0] + info[1];
  if (info[3] === "97") {
    if (!D.si[fullCls]) D.si[fullCls] = {};
    if (D.si[fullCls]["97"] === undefined) D.si[fullCls]["97"] = kkk1Idx;
  }
}

// ── 3）病態等分類 + 5）年齢等 + 点数表 → D.pt（DPCコード7-8桁目の条件ラベル） ──
console.log("D.pt 生成中...");
{
  // 年齢等シート: cls → [{kind, name, ranges:[{from,to,val}]}]
  const ageMap = new Map();
  for (const row of S.age) {
    const mdc = pad2(row[0]), cls = pad4(row[1]);
    if (!mdc || !cls) continue;
    const kind = str(row[2]), name = str(row[3]);
    const ranges = [];
    for (let j = 4; j + 2 <= 18; j += 3) {
      const from = str(row[j]), to = str(row[j + 1]), val = str(row[j + 2]);
      if (from === "" || to === "" || val === "") continue;
      ranges.push({ from, to, val });
    }
    if (!ranges.length) continue;
    const fullCls = mdc + cls;
    if (!ageMap.has(fullCls)) ageMap.set(fullCls, []);
    ageMap.get(fullCls).push({ kind, name, ranges });
  }
  // 病態等分類シート: cls → [{code, ageFrom, ageTo, name}]
  const condMap = new Map();
  for (const row of S.pt) {
    const mdc = pad2(row[0]), cls = pad4(row[1]);
    if (!mdc || !cls) continue;
    const fullCls = mdc + cls;
    if (!condMap.has(fullCls)) condMap.set(fullCls, []);
    condMap.get(fullCls).push({ code: str(row[2]), ageFrom: str(row[4]), ageTo: str(row[5]), name: str(row[7]) });
  }
  const genAgeLabel = (fullCls, val) => {
    const conds = ageMap.get(fullCls) || [];
    const parts = [];
    for (const c of conds) {
      const fmt = COND_FORMAT[c.kind] || { prefix: c.name, unit: "", max: 999 };
      const hit = c.ranges.filter((r) => r.val === val).map((r) => rangeLabel(fmt.prefix, fmt.unit, r.from, r.to, fmt.max));
      if (hit.length) parts.push(hit.join("又は"));
    }
    return parts.join("・");
  };
  const genCondLabel = (fullCls, code) => {
    const rows = (condMap.get(fullCls) || []).filter((c) => c.code === code);
    if (!rows.length) return "";
    const names = [...new Set(rows.map((c) => c.name).filter(Boolean))];
    if (names.length) return names.join("／");
    const r = rows[0];
    return rangeLabel("", "歳", r.ageFrom, r.ageTo, 999);
  };
  const seen = new Set();
  for (const code of Object.keys(D.dpc)) {
    const cls = code.slice(0, 6), pos78 = code.slice(6, 8);
    if (pos78 === "xx") continue;
    const k = `${cls}_${pos78}`;
    if (seen.has(k)) continue;
    seen.add(k);
    let label = clsPosLabels.get(k) || "";
    if (!label) {
      const p7 = pos78[0], p8 = pos78[1];
      const condLabel = p7 !== X ? genCondLabel(cls, p7) : "";
      const ageLabel = p8 !== X ? genAgeLabel(cls, p8) : "";
      label = [condLabel, ageLabel].filter(Boolean).join("・");
    }
    if (!label) { warn(`D.pt: 条件ラベルを生成できません ${code}`); continue; }
    if (!D.pt[cls]) D.pt[cls] = {};
    D.pt[cls][pos78] = label;
  }
}
console.log(`  → ${Object.keys(D.pt).length} 件`);

// ── 10-1〜4）重症度等 + 点数表 → D.sv（DPCコード14桁目） ──
// 実際にDPCコード14桁目で分岐している分類のみ出力する（定義のみで未使用の条件は除外）
console.log("D.sv 生成中...");
{
  const svName = new Map(); // cls → 条件名
  const genLabel = new Map(); // cls → {val → label}
  const put = (cls, val, label) => {
    if (val === "" || !label) return;
    if (!genLabel.has(cls)) genLabel.set(cls, {});
    if (!genLabel.get(cls)[val]) genLabel.get(cls)[val] = label;
  };
  const setName = (cls, name) => { if (name && !svName.has(cls)) svName.set(cls, name); };
  // 10-4）脳卒中の発症時期・A-DROP・Child-Pugh 等
  for (const row of S.sv4) {
    const cls = pad2(row[0]) + pad4(row[1]);
    if (cls.length !== 6) continue;
    setName(cls, str(row[5]));
    put(cls, str(row[2]), str(row[7]));
  }
  // 10-2）手術等（片眼・両眼、リハビリ 等）
  for (const row of S.sv2) {
    const cls = pad2(row[0]) + pad4(row[1]);
    if (cls.length !== 6) continue;
    setName(cls, str(row[3]));
    put(cls, str(row[5]), str(row[4]));
    put(cls, str(row[7]), str(row[6]));
  }
  // 10-1）ＪＣＳ・年齢
  for (const row of S.sv1) {
    const cls = pad2(row[0]) + pad4(row[1]);
    if (cls.length !== 6) continue;
    const kind = str(row[2]), name = str(row[3]);
    setName(cls, name);
    const fmt = COND_FORMAT[kind] || { prefix: name, unit: "", max: 999 };
    put(cls, str(row[6]), rangeLabel(fmt.prefix, fmt.unit, row[4], row[5], fmt.max));
    put(cls, str(row[9]), rangeLabel(fmt.prefix, fmt.unit, row[7], row[8], fmt.max));
  }
  // 10-3）重症・軽症（急性膵炎）
  for (const row of S.sv3) {
    const cls = pad2(row[0]) + pad4(row[1]);
    if (cls.length !== 6) continue;
    const condName = str(row[3]);
    setName(cls, condName.replace(/[（(].*$/, "").trim());
    for (const [f, t, v] of [[4, 5, 6], [7, 8, 9], [10, 11, 12]]) {
      const val = str(row[v]);
      if (val === "" || str(row[t]) === "") continue;
      put(cls, val, `${condName} ${toInt(row[f])}〜${toInt(row[t]) - 1}`);
    }
  }
  for (const [cls, labels] of svLabels) {
    const entry = { name: svName.get(cls) || "重症度等" };
    const gen = genLabel.get(cls) || {};
    for (const [digit, label] of Object.entries(labels)) entry[digit] = label || gen[digit] || digit;
    // 点数表に現れない値も定義シートから補完
    for (const [val, label] of Object.entries(gen)) if (!entry[val]) entry[val] = label;
    D.sv[cls] = entry;
  }
}
console.log(`  → D.sv: ${Object.keys(D.sv).length} 件`);

// ── 13）出来高算定手術等コード → D.dk（コードあり）, D.dx（薬剤名称・対象患者） ──
console.log("D.dk, D.dx 生成中...");
{
  let section = "code";
  for (const row of raw.dk) {
    const c0 = str(row[0]), c1 = str(row[1]), c2 = str(row[2]);
    // 小見出し行で区分を切り替える（手術コード / 検査コード / 対象患者 / 薬剤名称）
    if (compact(row[3]).includes("変更区分")) {
      if (c2.includes("薬剤")) section = "dr";
      else if (c2.includes("患者")) section = "pt";
      else section = "code";
      continue;
    }
    if (!/^\d{2}$/.test(c0)) continue; // 区分コード（00/01）を持つデータ行のみ
    const chg = str(row[3]);
    if (!/^\d$/.test(chg) || chg === "1") continue;
    const end = str(row[5]);
    if (isDate8(end) && end < asOf) continue;
    if (c1 && (/^[A-Z]\d/.test(c1) || /^\d{4}/.test(c1))) {
      if (c2) D.dk[c1] = c2;
    } else if (!c1 && c2) {
      const list = section === "pt" ? D.dx.pt : D.dx.dr;
      if (!list.includes(c2)) list.push(c2);
    }
  }
  if (Object.keys(D.dk).length === 0) {
    console.log("  [WARN] 出来高算定手術等コードがExcelに含まれていません。既存 src/data.js の D.dk を引き継ぎます");
    try {
      const existing = loadExistingData();
      if (existing?.dk) { D.dk = existing.dk; D.dx = existing.dx || D.dx; }
    } catch (e) {
      console.warn(`  [WARN] 既存 D.dk の読み込みに失敗: ${e.message}`);
    }
  }
  console.log(`  → D.dk: ${Object.keys(D.dk).length} 件, D.dx: 薬剤 ${D.dx.dr.length} 件 / 対象患者 ${D.dx.pt.length} 件`);
}

// ── 14）CCPM対応 → D.cc ──
console.log("D.cc 生成中...");
for (const row of S.cc) {
  const code = str(row[2]), ccpm = str(row[3]);
  if (code.length !== 14 || !ccpm) continue;
  D.cc[code] = ccpm;
}
console.log(`  → ${Object.keys(D.cc).length} 件`);

// ── 薬剤別名 → D.da（database/drug-aliases.json、公式Excelには含まれない運用データ） ──
console.log("D.da 生成中...");
{
  const p2Codes = new Set(Object.values(D.p2).flatMap((g) => Object.values(g).flat()));
  let aliases = {};
  if (existsSync(argAliases)) {
    aliases = JSON.parse(readFileSync(argAliases, "utf-8"));
  } else {
    console.log(`  [WARN] 薬剤別名ファイルがありません: ${argAliases}`);
  }
  const orphans = [];
  for (const code of Object.keys(aliases).sort()) {
    const list = [...new Set((aliases[code] || []).map(str).filter(Boolean))];
    if (!list.length) continue;
    if (!p2Codes.has(code)) { orphans.push(code); continue; }
    D.da[code] = list;
  }
  if (orphans.length) console.log(`  [NOTE] 現行の処置等２に存在しない別名コードを除外: ${orphans.join(", ")}`);
  const drugCodes = [...p2Codes].filter((c) => /^\d{4}$/.test(c));
  const noAlias = drugCodes.filter((c) => !D.da[c]);
  console.log(`  → D.da: ${Object.keys(D.da).length} 件（4桁ダミーコード ${drugCodes.length} 件中、別名なし ${noAlias.length} 件）`);
}

// ── 病名別名・略語 → D.dn（database/disease-aliases.json、公式Excelには含まれない運用データ） ──
console.log("D.dn 生成中...");
{
  const aliasFile = join(DB_DIR, "disease-aliases.json");
  let aliases = {};
  if (existsSync(aliasFile)) aliases = JSON.parse(readFileSync(aliasFile, "utf-8"));
  else console.log(`  [WARN] 病名別名ファイルがありません: ${aliasFile}`);
  const orphans = [];
  for (const alias of Object.keys(aliases).sort()) {
    if (alias.startsWith("_")) continue; // _comment 等
    const codes = [...new Set((aliases[alias] || []).map(str).filter(Boolean))];
    const ok = codes.filter((c) => D.icn[c] !== undefined);
    for (const c of codes) if (!D.icn[c]) orphans.push(`${alias}→${c}`);
    if (ok.length) D.dn[str(alias).trim()] = ok;
  }
  if (orphans.length) console.log(`  [NOTE] ICDテーブルに存在しないコードを除外: ${orphans.join(", ")}`);
  console.log(`  → D.dn: ${Object.keys(D.dn).length} 件`);
}

// ── 手術・処置等の別名（現場用語） → D.pn（database/procedure-aliases.json、公式Excelには含まれない運用データ） ──
console.log("D.pn 生成中...");
{
  const aliasFile = join(DB_DIR, "procedure-aliases.json");
  let aliases = {};
  if (existsSync(aliasFile)) aliases = JSON.parse(readFileSync(aliasFile, "utf-8"));
  else console.log(`  [WARN] 手術・処置等別名ファイルがありません: ${aliasFile}`);
  const known = new Set([...D.sl.flat(), ...Object.values(D.p1).flatMap((g) => Object.values(g).flat()), ...Object.values(D.p2).flatMap((g) => Object.values(g).flat()), ...Object.keys(D.dk)]);
  const orphans = [];
  for (const alias of Object.keys(aliases).sort()) {
    if (alias.startsWith("_")) continue;
    const codes = [...new Set((aliases[alias] || []).map(str).filter(Boolean))];
    const ok = codes.filter((c) => known.has(c));
    for (const c of codes) if (!known.has(c)) orphans.push(`${alias}→${c}`);
    if (ok.length) D.pn[str(alias).trim()] = ok;
  }
  if (orphans.length) console.log(`  [NOTE] 定義テーブルに存在しないコードを除外: ${orphans.join(", ")}`);
  console.log(`  → D.pn: ${Object.keys(D.pn).length} 件`);
}

// ── メタ情報 ──
{
  let label = "";
  const firstCell = str(raw.dummy?.[0]?.[0]);
  const m = firstCell.match(/(令和|平成)([〇一二三四五六七八九十０-９0-9]+)年度/);
  const starts = [];
  const clsMeta = findMetaCols(raw.cls);
  if (clsMeta) for (const r of raw.cls.slice(clsMeta.headerRow + 1)) { const v = str(r?.[clsMeta.start]); if (isDate8(v)) starts.push(v); }
  const effectiveFrom = starts.length ? starts.sort()[0] : "";
  if (m) label = `${m[1]}${kanjiToInt(m[2])}年度`;
  else if (effectiveFrom) label = `令和${parseInt(effectiveFrom.slice(0, 4), 10) - 2018}年度`;
  D.meta = { label, effectiveFrom, asOf, sourceFile: basename(excelPath) };
  console.log(`\nメタ情報: ${JSON.stringify(D.meta)}`);
}

function loadExistingData() {
  const existingData = readFileSync(DEFAULT_OUT, "utf-8");
  const match = existingData.match(/export\s+const\s+D\s*=\s*(\{[\s\S]+\});?\s*$/);
  return match ? JSON.parse(match[1]) : null;
}

// ── 検証 ──
console.log("\n── 検証 ──");
const count = (v) => (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
let existing = null;
try { existing = loadExistingData(); } catch { /* 初回生成時など */ }
console.log("件数サマリー（→ 現行 src/data.js との比較）:");
for (const key of Object.keys(D)) {
  if (key === "meta") continue;
  const n = count(D[key]);
  const prev = existing ? count(existing[key]) : null;
  const diff = prev == null ? "" : n === prev ? "  (変更なし)" : `  (現行 ${prev} → ${n >= prev ? "+" : ""}${n - prev})`;
  console.log(`  D.${key.padEnd(4)}: ${String(n).padStart(6)} 件${diff}`);
}

let errors = 0;
const error = (msg) => { errors++; console.error(`  [ERROR] ${msg}`); };
for (const fullCls of Object.keys(D.cls)) {
  if (!D.icd[fullCls]) error(`D.icd にキー「${fullCls}」がありません`);
}
for (const [fullCls, surgMap] of Object.entries(D.si)) {
  for (const [surgVal, idx] of Object.entries(surgMap)) {
    if (idx >= D.sl.length) error(`D.si[${fullCls}][${surgVal}]=${idx} が D.sl 範囲外`);
  }
}
let lbMissing = 0;
for (const [code, d] of Object.entries(D.dpc)) {
  if (d.length !== 13) error(`D.dpc[${code}] の長さが ${d.length}（期待値: 13）`);
  const cls = d[0] + d[1];
  if (!D.cls[cls]) error(`D.dpc[${code}] の分類 ${cls} が D.cls にありません`);
  if (d[2] === "1") {
    // 期間Ⅱが存在しないDPC（点数表で「-」）は d2=d1・点数Ⅱ=0 となる
    if (!(d[7] > 0 && d[8] >= d[7] && d[9] >= d[8])) error(`日数が不正: ${code} [${d[7]},${d[8]},${d[9]}]`);
    if (!(d[10] > 0 && d[12] > 0)) error(`包括対象なのに期間Ⅰ/Ⅲ点数が0: ${code}`);
    if (d[8] > d[7] && !(d[11] > 0)) error(`期間Ⅱがあるのに点数Ⅱが0: ${code}`);
    if (d[8] === d[7] && d[11] !== 0) warn(`期間Ⅱなし（日数Ⅱ=Ⅰ）なのに点数Ⅱあり: ${code}`);
  } else if (d[10] || d[11] || d[12]) {
    error(`出来高（包括対象外）なのに点数あり: ${code}`);
  }
  const lb = D.lb[cls] || {};
  if (d[3] !== "xx" && !lb.o?.[d[3]]) lbMissing++;
  if (d[4] !== X && !lb["1"]?.[d[4]]) lbMissing++;
  if (d[5] !== X && !lb["2"]?.[d[5]]) lbMissing++;
  if (d[6] !== X && !lb.s?.[d[6]]) lbMissing++;
  const pos78 = code.slice(6, 8);
  if (pos78 !== "xx" && !D.pt[cls]?.[pos78]) error(`条件ラベルなし: ${code}`);
  if (code[13] !== X && !D.sv[cls]?.[code[13]]) error(`重症度ラベルなし: ${code}`);
}
if (lbMissing) error(`分岐ラベルの欠落 ${lbMissing} 件`);
for (const fullCls of Object.keys(D.br)) {
  if (!D.cls[fullCls]) error(`D.br の分類 ${fullCls} が D.cls にありません`);
}
if (!D.icd["071030"]?.includes(ICD_M_WILDCARD)) warn(`ＩＣＤ「${ICD_M_WILDCARD}」（筋骨格系の包括コード）が 071030 に見つかりません`);
if (!D.meta.label) warn("年度ラベルを特定できませんでした（D.meta.label が空）");

if (warnings.length) {
  console.log(`\n[WARN] ${warnings.length} 件:`);
  for (const w of warnings.slice(0, 30)) console.log(`  - ${w}`);
  if (warnings.length > 30) console.log(`  ... 他 ${warnings.length - 30} 件`);
}
if (errors === 0) console.log("  整合性チェック OK");
else console.error(`  ${errors} 件のエラー`);

// ── 出力 ──
if (dryRun) {
  console.log("\n[dry-run] ファイル出力はスキップされました");
} else if (errors > 0) {
  console.error("\n整合性エラーがあるため出力を中止しました。");
  process.exit(1);
} else {
  console.log(`\n出力中: ${argOut}`);
  const output = `export const D=${JSON.stringify(D)};\n`;
  writeFileSync(argOut, output, "utf-8");
  const sizeMB = (Buffer.byteLength(output, "utf-8") / 1024 / 1024).toFixed(2);
  console.log(`  → ${sizeMB} MB`);
}
console.log("\n完了!");
