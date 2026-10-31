// 確かめる対象：予想の向きのボタンを続けて押したときの値の動き（nudge）。
// 想定する故障：押しても値が止まったまま・逆の側から押したとき前の値の続きで動く・端を越える・小数の目盛りで誤差がたまる。
// 見つけ方：今の値 5 から右・右・右・左…と押した列を、手で書いた期待の列と比べる。既存のテスト（e2e の向きと値の連動）は1回押しだけを見る。
import { describe, expect, it } from "vitest";
import { nudge } from "../src/nudge";

const press = (seq: number[], start: number, base: number, step: number, lo: number, hi: number) => {
  const out: number[] = []; let v = start;
  for (const d of seq) { v = nudge(d, v, base, step, lo, hi); out.push(v); }
  return out;
};

describe("nudge", () => {
  it("右を押すたびに1つ右、逆の側から左を押すと今の値の1つ左から", () => {
    expect(press([2, 2, 2, 0, 0, 0], 5, 5, 1, 0, 10)).toEqual([6, 7, 8, 4, 3, 2]);
  });
  it("動かないは今の値に戻り、端では止まる", () => {
    expect(press([2, 1, 2, 2, 2], 5, 5, 1, 0, 7)).toEqual([6, 5, 6, 7, 7]);
    expect(press([0, 0], 1, 1, 1, 0, 10)).toEqual([0, 0]);
  });
  it("小数の目盛りでも誤差がたまらない", () => {
    expect(press([2, 2, 2], 3.5, 3.5, 0.1, 1, 6)).toEqual([3.6, 3.7, 3.8]);
  });
});
