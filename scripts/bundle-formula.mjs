// 教材（stats2-course）が使う計算を、1ファイルずつの束にする。束はコミットし、教材は型・tokens と同じ sync で写して版を固定する。
// - dist/formula.mjs（ESM）：式の計算。教材の build（Python）が node で読み、木から TeX を作り検査する（#118 単位 A）
// - dist/random.js（ラボに差し込む1つの script。グローバル MLRandom）：種つき乱数とラボの引き方。教材の labkit が LK.rng(seed) で使う（#144 P6）
//   node scripts/bundle-formula.mjs          作り直して書く
//   node scripts/bundle-formula.mjs --check  今の元から作った束が、コミットした束と同じか（違えば止める。npm run check）
import { build } from "rolldown";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const HEAD = (src) => `// 生成物：${src} から scripts/bundle-formula.mjs で作る。手で直さない（npm run bundle）\n`;
const BUNDLES = [
  { out: "packages/engine/dist/formula.mjs", input: "packages/engine/src/formula/index.ts", src: "packages/engine/src/formula", output: { format: "esm" } },
  { out: "packages/engine/dist/random.js", input: "packages/engine/src/random.ts", src: "packages/engine/src/random.ts", output: { format: "iife", name: "MLRandom" } },
];
let bad = 0;
for (const b of BUNDLES) {
  const r = await build({ input: b.input, output: b.output, write: false, logLevel: "silent" });
  const code = HEAD(b.src) + r.output[0].code;
  if (process.argv.includes("--check")) {
    let now = "";
    try { now = readFileSync(b.out, "utf8"); } catch { /* ない */ }
    if (now !== code) { console.error(`✗ ${b.out} が元（${b.src}）と違う。npm run bundle で作り直してコミットする`); bad++; }
    else console.log(`✓ ${b.out} は元と同じ`);
  } else {
    mkdirSync("packages/engine/dist", { recursive: true });
    writeFileSync(b.out, code);
    console.log(`書いた：${b.out}（${code.length} 字）`);
  }
}
if (bad) process.exit(1);
