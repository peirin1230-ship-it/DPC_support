#!/usr/bin/env node
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const tempDir = mkdtempSync(join(tmpdir(), "dpc-validate-"));
const outPath = join(tempDir, "generated-data.js");

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}

console.log("[1/3] 公式Excelから data.js を一時生成中...");
const gen = spawnSync(
  process.execPath,
  ["scripts/generate-data.mjs", "--keep-da", "--out", outPath],
  { cwd: ROOT, stdio: "inherit" }
);
if (gen.status !== 0) fail("データ生成に失敗しました。");

console.log("\n[2/3] 現行データと比較中...");
const currentUrl = pathToFileURL(join(ROOT, "src", "data.js")).href;
const generatedUrl = `${pathToFileURL(outPath).href}?v=${Date.now()}`;
const [{ D: current }, { D: generated }] = await Promise.all([
  import(currentUrl),
  import(generatedUrl),
]);

const targets = ["dpc", "cls", "lb", "br", "p1", "p2", "si", "sl", "icd", "icn", "sd", "sv", "dk", "cn", "da", "pt"];
const count = (v) => (Array.isArray(v) ? v.length : Object.keys(v || {}).length);

const issues = [];
for (const key of targets) {
  const a = current[key];
  const b = generated[key];
  const countA = count(a);
  const countB = count(b);

  if (countA !== countB) {
    issues.push(`${key}: 件数不一致 current=${countA}, generated=${countB}`);
    continue;
  }

  if (JSON.stringify(a) !== JSON.stringify(b)) {
    issues.push(`${key}: 内容が一致しません（件数は一致）`);
  }
}

const surgVals = new Set(Object.values(current.dpc).map((x) => x[3]));
for (const required of ["97", "99"]) {
  if (!surgVals.has(required)) {
    issues.push(`dpc: 必須手術区分 ${required} が存在しません`);
  }
}

if (issues.length > 0) {
  console.error("\n一致しない項目:");
  for (const item of issues) console.error(`- ${item}`);
  fail("src/data.js が公式Excel再生成結果と一致しません。");
}

console.log("[OK] src/data.js は公式Excel再生成結果と一致しています。");

console.log("\n[3/3] 後始末...");
rmSync(tempDir, { recursive: true, force: true });
console.log("完了。");
