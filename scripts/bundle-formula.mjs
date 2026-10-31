// 式の計算（packages/engine/src/formula）を1ファイルの束にする（stats2-course #118 単位 A）。
// 教材の build（Python）は、この束を node で読んで木から TeX を作り、検査する（同じ計算を Python に書き写さない）。
// 束はコミットし、教材は型・tokens と同じ sync で写して版を固定する。
//   node scripts/bundle-formula.mjs          作り直して書く
//   node scripts/bundle-formula.mjs --check  今の元から作った束が、コミットした束と同じか（違えば止める。npm run check）
import { build } from "rolldown";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "packages/engine/dist/formula.mjs";
const HEAD = "// 生成物：packages/engine/src/formula から scripts/bundle-formula.mjs で作る。手で直さない（npm run bundle）\n";
const r = await build({ input: "packages/engine/src/formula/index.ts", output: { format: "esm" }, write: false, logLevel: "silent" });
const code = HEAD + r.output[0].code;
if (process.argv.includes("--check")) {
  let now = "";
  try { now = readFileSync(OUT, "utf8"); } catch { /* ない */ }
  if (now !== code) { console.error(`✗ ${OUT} が元（src/formula）と違う。npm run bundle で作り直してコミットする`); process.exit(1); }
  console.log(`✓ ${OUT} は元と同じ`);
} else {
  mkdirSync("packages/engine/dist", { recursive: true });
  writeFileSync(OUT, code);
  console.log(`書いた：${OUT}（${code.length} 字）`);
}
