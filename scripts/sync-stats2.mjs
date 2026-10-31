// 教材（stats2-course）の式の見本と独立な見本の写しを確かめる・取り込む（#118 単位 B・C5）。
//   node scripts/sync-stats2.mjs                       写しが stats2.lock.json の版の元と同じか（違えば止まる。npm run check）
//   node scripts/sync-stats2.mjs --from ../stats2-course 手元の教材（コミット済みの版）から取り込み、版を固定する
// 元：stats2-course の docs/formula-correctness/formulas.json（式の木と契約。build/formula_fixture.py）・reference.json（独立な見本。build/oracle.py）。
// 写しを直接直さない（教材で直して取り込む）。教材を直したのに写しが古いと、テストが古い式で通ってしまう。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LOCK = "stats2.lock.json";
const RAW = "https://raw.githubusercontent.com/Watanabe-Masao/stats2-course";
const FILES = [
  ["docs/formula-correctness/formulas.json", "packages/engine/test/fixtures/stats2-formulas.json"],
  ["docs/formula-correctness/reference.json", "packages/engine/test/fixtures/stats2-reference.json"],
];

const i = process.argv.indexOf("--from");
if (i > 0) {
  const from = process.argv[i + 1];
  const ref = execFileSync("git", ["-C", from, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["-C", from, "status", "--porcelain", "docs/formula-correctness"], { encoding: "utf8" }).trim();
  if (dirty) { console.error(`❌ ${from} に取り込んでいない変更がある（コミットして GitHub に送った版から取り込む）`); process.exit(1); }
  for (const [src, dst] of FILES) writeFileSync(dst, readFileSync(`${from}/${src}`, "utf8"));
  writeFileSync(LOCK, JSON.stringify({ ref, files: FILES.map(([s]) => s) }, null, 1) + "\n");
  console.log(`取り込んだ：stats2-course ${ref.slice(0, 7)}（${FILES.length} ファイル）`);
} else {
  const { ref } = JSON.parse(readFileSync(LOCK, "utf8"));
  const bad = [];
  for (const [src, dst] of FILES) {
    const r = await fetch(`${RAW}/${ref}/${src}`);
    if (!r.ok) { bad.push(`${src}：stats2-course ${ref.slice(0, 7)} から読めない（${r.status}）`); continue; }
    if ((await r.text()) !== readFileSync(dst, "utf8")) bad.push(`${dst}：stats2-course ${ref.slice(0, 7)} の ${src} と違う`);
  }
  if (bad.length) { console.error("❌ 教材の写し\n" + bad.join("\n") + "\n（教材で直し、node scripts/sync-stats2.mjs --from ../stats2-course で取り込む）"); process.exit(1); }
  console.log(`✅ 教材の写し（stats2-course ${ref.slice(0, 7)}・${FILES.length} ファイル）は元と同じ`);
}
