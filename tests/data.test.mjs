// src/data.js（生成データ）の整合性テスト
// 特定のDPCコードをハードコードせず、データ構造の不変条件を検証する（改定後もそのまま使える）
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { D } from "../src/data.js";
import { getLabel, getCondLabel, getSevInfo, ICD_M_WILDCARD } from "../src/utils.js";

const X = "x";
const codeRe = /^\d{2}[0-9x]{4}[0-9x]{2}(\d{2}|xx)[0-9xA-Z]{4}$/;

describe("D.meta", () => {
  test("年度・適用日・基準日・元ファイル名を持つ", () => {
    assert.match(D.meta.label, /^(令和|平成)\d+年度$/);
    assert.match(D.meta.effectiveFrom, /^\d{8}$/);
    assert.match(D.meta.asOf, /^\d{8}$/);
    assert.ok(D.meta.asOf >= D.meta.effectiveFrom);
    assert.match(D.meta.sourceFile, /\.xlsx$/);
  });
});

describe("D.dpc", () => {
  test("全DPCが14桁コードで13要素・分類が存在する", () => {
    for (const [code, d] of Object.entries(D.dpc)) {
      assert.match(code, codeRe, code);
      assert.equal(d.length, 13, code);
      assert.equal(d[0] + d[1], code.slice(0, 6), `${code}: MDC/分類がコードと不一致`);
      assert.ok(D.cls[d[0] + d[1]], `${code}: 分類名なし`);
      assert.equal(d[3], code.slice(8, 10), `${code}: 手術区分がコードと不一致`);
      assert.equal(d[4], code[10]); assert.equal(d[5], code[11]); assert.equal(d[6], code[12]);
    }
  });
  test("包括対象は日数昇順・点数あり（期間Ⅱなしは d2=d1・点数Ⅱ=0）、出来高は日数点数0", () => {
    let noPeriodII = 0;
    for (const [code, d] of Object.entries(D.dpc)) {
      if (d[2] === "1") {
        assert.ok(d[7] > 0 && d[8] >= d[7] && d[9] >= d[8], `${code}: 日数 ${d.slice(7, 10)}`);
        assert.ok(d[10] > 0 && d[12] > 0, `${code}: 点数 ${d.slice(10)}`);
        if (d[8] > d[7]) assert.ok(d[11] > 0, `${code}: 期間Ⅱ点数 ${d[11]}`);
        else { assert.equal(d[11], 0, `${code}: 期間Ⅱなしなのに点数あり`); noPeriodII++; }
      } else {
        assert.equal(d[2], "0", code);
        assert.deepEqual(d.slice(7), [0, 0, 0, 0, 0, 0], code);
      }
    }
  });
  test("手術区分は 01〜, 97, 99, xx のみ", () => {
    const vals = new Set(Object.values(D.dpc).map((d) => d[3]));
    for (const v of vals) assert.match(v, /^(0[1-9]|1\d|97|99|xx)$/, v);
    assert.ok(vals.has("97") && vals.has("99") && vals.has("xx"));
  });
  test("分岐ありの桁には必ずラベルがある（分岐なし x は空）", () => {
    for (const [code, d] of Object.entries(D.dpc)) {
      const cls = d[0] + d[1];
      if (d[3] !== "xx") assert.notEqual(getLabel(cls, "o", d[3]), d[3], `${code}: 手術ラベルなし`);
      else assert.equal(getLabel(cls, "o", d[3]), "");
      for (const [t, v] of [["1", d[4]], ["2", d[5]], ["s", d[6]]]) {
        if (v === X) assert.equal(getLabel(cls, t, v, d[3]), "");
        else assert.notEqual(getLabel(cls, t, v, d[3]), v, `${code}: ${t} ラベルなし`);
      }
    }
  });
  test("7-8桁目の条件と14桁目の重症度にラベルがある", () => {
    for (const [code, d] of Object.entries(D.dpc)) {
      const cls = d[0] + d[1];
      if (code.slice(6, 8) !== "xx") assert.ok(getCondLabel(cls, code), `${code}: 条件ラベルなし`);
      else assert.equal(getCondLabel(cls, code), "");
      if (code[13] !== X) {
        const sev = getSevInfo(cls, code);
        assert.ok(sev && sev.label && sev.name, `${code}: 重症度ラベルなし`);
      } else assert.equal(getSevInfo(cls, code), null);
    }
  });
});

describe("D.br", () => {
  test("分岐フラグはコードの桁と一致する", () => {
    for (const [code, d] of Object.entries(D.dpc)) {
      const br = D.br[d[0] + d[1]]?.[d[3]] || {};
      if (d[4] !== X) assert.equal(br["1"], 1, code);
      if (d[5] !== X) assert.equal(br["2"], 1, code);
      if (d[6] !== X) assert.equal(br.s, 1, code);
    }
  });
});

describe("D.cls / D.icd / D.si / D.sl", () => {
  test("全分類に ICD一覧・手術インデックス（99）・DPC がある", () => {
    const clsWithDpc = new Set(Object.values(D.dpc).map((d) => d[0] + d[1]));
    for (const cls of Object.keys(D.cls)) {
      assert.ok(Array.isArray(D.icd[cls]) && D.icd[cls].length > 0, `${cls}: ICDなし`);
      assert.ok(D.si[cls] && D.si[cls]["99"] === 0, `${cls}: si[99]`);
      assert.ok(clsWithDpc.has(cls), `${cls}: DPCなし`);
    }
    for (const cls of clsWithDpc) assert.ok(D.cls[cls], `${cls}: 分類名なし`);
  });
  test("D.si のインデックスは D.sl の範囲内、97 は KKK1 を含む", () => {
    for (const [cls, si] of Object.entries(D.si)) {
      for (const [sv, idx] of Object.entries(si)) {
        assert.ok(Number.isInteger(idx) && idx >= 0 && idx < D.sl.length, `${cls}[${sv}]=${idx}`);
        if (sv === "97") assert.ok(D.sl[idx].includes("KKK1"), `${cls}[97] に KKK1 がない`);
        if (sv === "99") assert.deepEqual(D.sl[idx], ["KKK0"]);
      }
    }
  });
  test("ICD コード表記（末尾$は前方一致）と M!!!! は 071030 のみ", () => {
    for (const [cls, codes] of Object.entries(D.icd)) {
      for (const c of codes) {
        if (c === ICD_M_WILDCARD) { assert.equal(cls, "071030"); continue; }
        assert.match(c, /^[A-Z]\d{2}\d{0,2}\$?$/, `${cls}: ${c}`);
        assert.ok(D.icn[c], `${c}: 病名なし`);
      }
    }
    assert.ok(D.icd["071030"].includes(ICD_M_WILDCARD));
  });
});

describe("D.p1 / D.p2 / D.pc / D.cn", () => {
  test("処置等コードには名称がある（組み合わせ K1+K2 を含む）", () => {
    const all = new Set([...D.sl.flat(), ...Object.values(D.p1).flatMap((g) => Object.values(g).flat()), ...Object.values(D.p2).flatMap((g) => Object.values(g).flat())]);
    for (const c of all) assert.ok(D.cn[c], `${c}: 名称なし`);
  });
  test("相関値キーは 0-9A-Z の1文字", () => {
    for (const table of [D.p1, D.p2]) for (const grp of Object.values(table)) for (const cv of Object.keys(grp)) assert.match(cv, /^[0-9A-Z]$/);
  });
  test("手術との組み合わせ条件は処置等1のコードと手術Kコードを指す", () => {
    for (const [cls, m] of Object.entries(D.pc)) {
      const p1codes = new Set(Object.values(D.p1[cls] || {}).flat());
      for (const [code, surgs] of Object.entries(m)) {
        assert.ok(p1codes.has(code), `${cls}: ${code}`);
        for (const s of surgs) assert.match(s, /^K/, s);
      }
    }
  });
});

describe("D.sd（定義副傷病）", () => {
  test("フラグ別リスト（a:共通, n:手術なし, s:手術あり）を持ち、ICDに病名がある", () => {
    let withScope = 0;
    for (const [cls, byVal] of Object.entries(D.sd)) {
      assert.ok(D.cls[cls], cls);
      for (const [val, e] of Object.entries(byVal)) {
        assert.match(val, /^[1-9A-Z]$/);
        assert.equal(typeof e, "object");
        for (const [k, codes] of Object.entries(e)) {
          assert.ok(["a", "n", "s"].includes(k), `${cls}: scope ${k}`);
          if (k !== "a") withScope++;
          for (const c of codes) assert.ok(D.icn[c] || D.icn[c.replace(/\$$/, "")], `${cls}: ${c} 病名なし`);
        }
      }
    }
    assert.ok(withScope > 0, "手術あり/なし限定の副傷病が1件も無い");
  });
});

describe("D.sv / D.pt", () => {
  test("重症度定義は実際に14桁目で分岐している分類のみ", () => {
    const used = new Set(Object.keys(D.dpc).filter((c) => c[13] !== X).map((c) => c.slice(0, 6)));
    assert.deepEqual(new Set(Object.keys(D.sv)), used);
    for (const sv of Object.values(D.sv)) assert.ok(sv.name);
  });
  test("条件ラベルは実際に7-8桁目を使う分類のみ", () => {
    const used = new Set(Object.keys(D.dpc).filter((c) => c.slice(6, 8) !== "xx").map((c) => c.slice(0, 6)));
    assert.deepEqual(new Set(Object.keys(D.pt)), used);
  });
});

describe("D.cv（変換テーブルの対応コード→桁の縮約）", () => {
  test("写像先の桁は実在するDPCの桁で、対応コードは定義テーブルに存在する", () => {
    assert.ok(Object.keys(D.cv).length > 0, "縮約が1件も無い（令和8年度は MDC05 に存在するはず）");
    for (const [cls, bySurg] of Object.entries(D.cv)) {
      assert.ok(D.cls[cls], cls);
      for (const [sv, byType] of Object.entries(bySurg)) {
        const codes = D.dpc && Object.keys(D.dpc).filter((c) => c.startsWith(cls) && c.slice(8, 10) === sv);
        assert.ok(codes.length > 0, `${cls}/${sv}: DPCなし`);
        for (const [t, m] of Object.entries(byType)) {
          const pos = t === "1" ? 10 : t === "2" ? 11 : 12;
          const table = t === "1" ? D.p1 : t === "2" ? D.p2 : D.sd;
          for (const [corr, digit] of Object.entries(m)) {
            assert.notEqual(corr, digit);
            assert.ok(codes.some((c) => c[pos] === digit), `${cls}/${sv}/${t}: 桁 ${digit} のDPCがない`);
            assert.ok(table[cls] && table[cls][corr] !== undefined, `${cls}: 対応コード ${corr} が定義テーブルにない`);
          }
        }
      }
    }
  });
});

describe("D.dk / D.dx / D.da / D.dn / D.cc", () => {
  test("出来高算定コードは K/D コード形式", () => {
    assert.ok(Object.keys(D.dk).length > 0);
    for (const [c, n] of Object.entries(D.dk)) { assert.match(c, /^[A-Z]\d/, c); assert.ok(n); }
    assert.ok(Array.isArray(D.dx.dr) && Array.isArray(D.dx.pt));
  });
  test("薬剤別名は現行の処置等2コードのみを指す", () => {
    const p2codes = new Set(Object.values(D.p2).flatMap((g) => Object.values(g).flat()));
    for (const [c, al] of Object.entries(D.da)) {
      assert.ok(p2codes.has(c), `${c}: 処置等2に存在しない`);
      assert.ok(Array.isArray(al) && al.length > 0 && al.every((a) => typeof a === "string" && a));
    }
  });
  test("病名別名（D.dn）は現行ICDテーブルのキーのみを指す", () => {
    assert.ok(Object.keys(D.dn).length > 0);
    for (const [alias, codes] of Object.entries(D.dn)) {
      assert.ok(alias && !alias.startsWith("_"), alias);
      assert.ok(Array.isArray(codes) && codes.length > 0, alias);
      for (const c of codes) assert.ok(D.icn[c] !== undefined, `${alias}: ${c} がICDテーブルにない`);
    }
  });
  test("CCPM対応は既存DPCコードを指す", () => {
    for (const [code, cc] of Object.entries(D.cc)) { assert.ok(D.dpc[code], code); assert.match(cc, /CCPM\d{2}$/); }
  });
});
