// 確かめる対象：移り変わりの道（runningMean・runningSd・runningShare。stats2-course #161 の観察の図）。
// 想定する故障：1つずれる（i 番目で i＋1 個でなく i 個で割る）・標準偏差を n−1 で割る（記録のまとめ summarize と物差しが違う）・大きな値で桁が落ちる。
// 見つけ方：どの時点の値も、その時点までの値を直接まとめた平均・分散（式を別に書く）と比べる。大きな値（1e9 前後）も入れる。
// 既存との違い：summarize は最後の時点だけを見ていた
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runningMean, runningSd, runningShare } from "../src";

const direct = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { m, sd: Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) }; };
describe("移り変わりの道は、その時点までを直接まとめた値と同じ", () => {
  it("平均・標準偏差（÷個数）・割合", () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1e9, max: 1e9 + 30 })), { minLength: 1, maxLength: 60 }), (xs) => {
      const mp = runningMean(xs), sp = runningSd(xs), sh = runningShare(xs.map((x) => x % 2 === 0));
      xs.forEach((_, i) => {
        const d = direct(xs.slice(0, i + 1)), tol = 1e-9 * Math.max(1, Math.abs(d.m));
        expect(Math.abs(mp[i]! - d.m)).toBeLessThanOrEqual(tol);
        expect(Math.abs(sp[i]! - d.sd)).toBeLessThanOrEqual(1e-6 * Math.max(1, d.sd));
        expect(sh[i]).toBe(xs.slice(0, i + 1).filter((x) => x % 2 === 0).length / (i + 1));
      });
    }), { numRuns: 200 });
  });
});
