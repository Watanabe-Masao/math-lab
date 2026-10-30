// デザインの決まりを確かめる（npm run check の中で走る）。packages/ui/src と、部品を使う画面が対象。
// - 色の値（#fff・rgb()・hsl()）は packages/ui/tokens.json にだけ書く（src/tokens.css に変数として出る）。ほかは var(--…) を使う
// - 動きの長さは変数（--dur-press・--dur・--dur-flash・--dur-sheet）だけ。ずっと動く飾り（infinite）は使わない
// - 部品（.tsx）は className="…"（グローバルな名前）を使わない。CSS Modules を使う
// - src/tokens.css は tokens.json から作ったものと同じ（npm run tokens で作り直す）
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tokensCss } from "../packages/ui/scripts/tokens.mjs";
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|tsx?)$/.test(f) && f !== "tokens.css") files.push(p); } };
walk("packages/ui/src");
const bad = [];
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, "");
    if (/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(code) && !/data-testid|#\{|href=|url\(#/.test(code)) bad.push(`${f}:${i + 1} 色の値は tokens.json へ：${line.trim()}`);
    if (/\b(rgba?|hsla?)\(/.test(code)) bad.push(`${f}:${i + 1} 色の値は tokens.json へ：${line.trim()}`);
    if (/(transition|animation)[\w-]*\s*:/.test(code) && (code.match(/(?<![\w-])\.?\d+(\.\d+)?m?s\b/g) ?? []).some((m) => m !== "0s")) bad.push(`${f}:${i + 1} 動きの長さは変数で：${line.trim()}`);
    if (/\binfinite\b/.test(code)) bad.push(`${f}:${i + 1} ずっと動く飾りは使わない：${line.trim()}`);
    if (f.endsWith(".tsx") && /className="/.test(code)) bad.push(`${f}:${i + 1} グローバルな className は使わない：${line.trim()}`);
  });
}
const want = tokensCss(JSON.parse(readFileSync("packages/ui/tokens.json", "utf8")));
if (readFileSync("packages/ui/src/tokens.css", "utf8") !== want) bad.push("packages/ui/src/tokens.css が tokens.json と違う（npm run tokens で作り直す）");
if (bad.length) { console.error("❌ デザインの決まり\n" + bad.join("\n")); process.exit(1); }
console.log(`✅ デザインの決まり（${files.length} ファイル）`);
