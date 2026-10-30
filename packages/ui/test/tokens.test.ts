// 見た目と手触りの値（packages/ui/tokens.json）：名前が重ならない・色はライトとダークの両方・CSS が使う変数はすべてある
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error 生成の道具は .mjs
import { flatten, tokensCss } from "../scripts/tokens.mjs";

const json = JSON.parse(readFileSync("packages/ui/tokens.json", "utf8"));
const vars: [string, string, string | null, string, string][] = flatten(json);

describe("packages/ui/tokens.json", () => {
  it("色はすべてダークの値も持つ", () => {
    const missing = vars.filter((v) => v[4] === "color" && v[2] === null).map((v) => v[0]);
    expect(missing).toEqual([]);
  });
  it("動きの値がある（押す・動く・光る・曲線・縮み）", () => {
    const names = vars.map((v) => v[0]);
    for (const n of ["dur-press", "dur", "dur-flash", "ease", "press-scale"]) expect(names).toContain(n);
    expect(tokensCss(json)).toContain("--ease: cubic-bezier(0.2, 0.8, 0.2, 1);");
  });
  it("CSS と画面が使う var(--…) はすべて定義がある", () => {
    const defined = new Set([...vars.map((v) => v[0]), "card", "mute"]);   // card・mute は古い名前（tokens.css の中で結ぶ）
    const used: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { walk(p); } else if (/\.(css|tsx?)$/.test(f)) for (const m of readFileSync(p, "utf8").matchAll(/var\(--([\w-]+)/g)) used.push(`${m[1]}（${p}）`); } };
    walk("packages/ui/src");
    expect(used.filter((u) => !defined.has(u.split("（")[0]))).toEqual([]);
  });
});
