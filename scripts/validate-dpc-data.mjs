#!/usr/bin/env node
/**
 * src/data.js が database/ の公式電子点数表から再生成した結果と一致することを検証する。
 *
 *   npm run validate:data
 *
 * 生成スクリプト（scripts/generate-data.mjs）を一時出力先で実行し、全キーを比較します。
 * 不一致がある場合はキーと差分の例を表示して終了コード1で終了します。
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "dpc-validate-"));
const outPath = join(tempDir, "generated-data.js");

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}

console.log("[1/3] 公式Excelから data.js を一時生成中...");
const gen = spawnSync(process.execPath, ["scripts/generate-data.mjs", "--out", outPath], { cwd: ROOT, stdio: "inherit" });
if (gen.status !== 0) fail("データ生成に失敗しました。");

console.log("\n[2/3] 現行データと比較中...");
const currentUrl = pathToFileURL(join(ROOT, "src", "data.js")).href;
const generatedUrl = `${pathToFileURL(outPath).href}?v=${Date.now()}`;
const [{ D: current }, { D: generated }] = await Promise.all([import(currentUrl), import(generatedUrl)]);

const count = (v) => (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
const keys = [...new Set([...Object.keys(current), ...Object.keys(generated)])].sort();

const issues = [];
for (const key of keys) {
  const a = current[key];
  const b = generated[key];
  if (a === undefined) { issues.push(`${key}: 現行 src/data.js に存在しません（再生成が必要）`); continue; }
  if (b === undefined) { issues.push(`${key}: 再生成結果に存在しません（現行データのみに存在）`); continue; }
  if (JSON.stringify(a) === JSON.stringify(b)) continue;
  const detail = [];
  if (count(a) !== count(b)) detail.push(`件数 current=${count(a)}, generated=${count(b)}`);
  if (!Array.isArray(a) && typeof a === "object") {
    const sub = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    detail.push(`差分キー ${sub.length} 件: ${sub.slice(0, 5).join(", ")}${sub.length > 5 ? " ..." : ""}`);
  }
  issues.push(`${key}: 内容が一致しません（${detail.join(" / ")}）`);
}

const surgVals = new Set(Object.values(current.dpc).map((x) => x[3]));
for (const required of ["97", "99"]) {
  if (!surgVals.has(required)) issues.push(`dpc: 必須手術区分 ${required} が存在しません`);
}

if (issues.length > 0) {
  console.error("\n一致しない項目:");
  for (const item of issues) console.error(`- ${item}`);
  fail("src/data.js が公式Excel再生成結果と一致しません。node scripts/generate-data.mjs で再生成してください。");
}

console.log(`[OK] src/data.js は公式Excel再生成結果と一致しています（${current.meta?.label || "年度不明"} / ${current.meta?.sourceFile || "?"} / as-of ${current.meta?.asOf || "?"}）。`);

console.log("\n[3/3] 後始末...");
rmSync(tempDir, { recursive: true, force: true });
console.log("完了。");
