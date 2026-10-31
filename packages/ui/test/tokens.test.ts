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
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { walk(p); } else if (/\.(css|tsx?)$/.test(f)) { const t = readFileSync(p, "utf8"); for (const m of t.matchAll(/var\(--([\w-]+)/g)) used.push(`${m[1]}（${p}）`); for (const m of t.matchAll(/["']--([\w-]+)["']\s*:/g)) defined.add(m[1]!); } } };   // 部品が style で渡す変数（スライダーの --fill）は、その部品の中の定義として数える
    walk("packages/ui/src");
    expect(used.filter((u) => !defined.has(u.split("（")[0]))).toEqual([]);
  });
});

// ばね（stats2-course #42）：tokens.json の linear() は spring.mjs の式から作った値と同じ。0 から始まり 1 で止まる
import { springAt, springLinear } from "../scripts/spring.mjs";
import tokensJson from "../tokens.json";
describe("ばねの動き", () => {
  const m = (tokensJson as unknown as { motion: Record<string, { $value: string; $extensions?: { spring?: { response: number; damping: number; duration: number } } }> }).motion;
  for (const name of ["ease-spring", "ease-bounce"]) {
    it(`${name} は式から作った値と同じ`, () => {
      const sp = m[name]!.$extensions!.spring!;
      expect(m[name]!.$value).toBe(springLinear(sp.response, sp.damping, sp.duration));
      expect(m[name]!.$value.startsWith("linear(0,")).toBe(true);
      expect(m[name]!.$value.endsWith(", 1)")).toBe(true);
    });
  }
  it("減衰 1 以上は行き過ぎず、1 未満は少しだけ行き過ぎる（10% まで）", () => {
    const max = (d: number) => Math.max(...Array.from({ length: 200 }, (_, i) => springAt(i / 200, 0.4, d)));
    expect(max(1)).toBeLessThanOrEqual(1);
    expect(max(0.7)).toBeGreaterThan(1);
    expect(max(0.7)).toBeLessThan(1.1);
  });
  it("止まる時間のあいだに、ほぼ 1 に着く（ずれ 2% 未満）", () => {
    for (const name of ["ease-spring", "ease-bounce"]) {
      const sp = m[name]!.$extensions!.spring!;
      expect(Math.abs(springAt(sp.duration, sp.response, sp.damping) - 1)).toBeLessThan(0.02);
    }
  });
});
