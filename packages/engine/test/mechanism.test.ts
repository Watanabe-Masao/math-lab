// 起き方そのものの期待値・分散（mechanismMoments）と、1セットを起こす手順（drawSet）が、起き方の定義と合うか（stats2-course #118 層3・#119）。
// 実験室の反例の言い分（「平均は np のまま」「山が広がる」）と予想の答えは、この式から決める。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRandom, drawSet, mechanismMoments, modelMoments, type Mechanism } from "../src";

/** 定義から全部の並びを数え上げた、成功の回数 k の確率（式を使わない独立な見本）。n は小さく（2^n 通り） */
function enumerate(m: Mechanism): number[] {
  const pmf = Array(m.n + 1).fill(0);
  if (m.kind === "mix") {
    // 定義：セットの最初に p−d か p＋d を半々で選び、セットの中は同じ確率。d＝min(spread, p, 1−p)
    const d = Math.min(m.spread, m.p, 1 - m.p);
    for (const q of [m.p - d, m.p + d]) {
      const b = enumerate({ kind: "bernoulli", n: m.n, p: q });
      b.forEach((x, k) => (pmf[k] += x / 2));
    }
    return pmf;
  }
  const walk = (i: number, prob: number, k: number, prev: number, hit: number) => {
    if (prob === 0) return;
    if (i === m.n) { pmf[k] += prob; return; }
    let q: number;
    if (m.kind === "bernoulli") q = m.p;
    else if (m.kind === "urn") q = hit / (m.total - i);
    else if (m.kind === "streak") q = i === 0 ? m.p : m.p + m.carry * (prev - m.p);
    else if (m.kind === "fatigue") { const d = Math.min(m.drop, m.p, 1 - m.p); q = m.n > 1 ? m.p + d - (2 * d * i) / (m.n - 1) : m.p; }   // 定義：最初 p＋d から最後 p−d へ等しく下がる
    else throw new Error("table は数え上げない");
    walk(i + 1, prob * q, k + 1, 1, hit - 1);
    walk(i + 1, prob * (1 - q), k, 0, hit);
  };
  walk(0, 1, 0, 0, m.kind === "urn" ? m.success : 0);
  return pmf;
}
const momentsOf = (pmf: number[]) => {
  const mean = pmf.reduce((s, x, k) => s + k * x, 0);
  return { mean, variance: pmf.reduce((s, x, k) => s + (k - mean) ** 2 * x, 0) };
};
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

const P = fc.oneof(fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(0, 0.01, 0.05, 0.17, 0.5, 0.95, 0.99, 1));
const small = fc.oneof(
  fc.record({ kind: fc.constant("streak" as const), n: fc.integer({ min: 1, max: 8 }), p: P, carry: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ kind: fc.constant("mix" as const), n: fc.integer({ min: 1, max: 8 }), p: P, spread: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ kind: fc.constant("fatigue" as const), n: fc.integer({ min: 1, max: 8 }), p: P, drop: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.integer({ min: 1, max: 12 }).chain((total) => fc.record({ kind: fc.constant("urn" as const), total: fc.constant(total), success: fc.integer({ min: 0, max: total }), n: fc.integer({ min: 1, max: Math.min(total, 8) }) })),
) as fc.Arbitrary<Mechanism>;

// 確かめる対象：mechanismMoments の期待値・分散（引きずられる・混ざる・戻さずに取る）。
// 想定する故障：分散の式の項の落とし（混ざるの n(n−1)d²・引きずられるの (n−h) の重み）・ずれ幅を詰めずに端で切り詰める（平均が p からずれる）。
// 見つけ方：起き方の定義から全部の並びを数え上げた確率（式を使わない）で、平均と分散を求めて比べる。p は端（0・1・0.05 など）を含む。
// 既存との違い：lab.test.ts は乱数で起こした平均・分散を許す幅で見るだけで、式そのものはなかった
describe("起き方の期待値・分散は、定義から数え上げた値と同じ", () => {
  it("引きずられる・混ざる・回を追って変わる・戻さずに取る（n≦8、端の p を含む）", () => {
    fc.assert(fc.property(small, (m) => {
      const want = momentsOf(enumerate(m)), got = mechanismMoments(m);
      return close(got.mean, want.mean) && close(got.variance, want.variance);
    }), { numRuns: 400 });
  });
  it("混ざる：どの p でも平均は np（端で切り詰めない）。p＝0・1 ではずれ幅0で、二項分布と同じ散らばり", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), P, fc.double({ min: 0, max: 1, noNaN: true }), (n, p, spread) => {
      const got = mechanismMoments({ kind: "mix", n, p, spread }), b = modelMoments({ kind: "binom", n, p });
      expect(close(got.mean, n * p)).toBe(true);
      const d = Math.min(spread, p, 1 - p);   // p＝0・1 か spread＝0 なら 0
      if (d === 0 || n === 1) expect(close(got.variance, b.variance)).toBe(true);
      else expect(close(got.variance - b.variance, n * (n - 1) * d * d)).toBe(true);   // 条件を満たすと散らばりが n(n−1)d² 増える（d が小さいと差も小さい）
    }), { numRuns: 300 });
  });
});

// 確かめる対象：drawSet の起き方が定義どおりか（セットの最初に1回だけ確率を選ぶ・ずれ幅を詰める・前の結果に寄る）。
// 想定する故障：混ざるで試行ごとに確率を選び直す（散らばりが二項分布と同じになる）・端で切り詰める・引きずられるの寄り方の向きの誤り。
// 見つけ方：k ごとの割合（理論と標準誤差が決まる統計量）を、数え上げた確率と標準誤差の5倍で比べる。種は固定。
// 既存との違い：lab.test.ts は平均と分散の大小だけで、分布の形（全部が成功のセットの割合など）は見ていなかった
// 検出能力：わざと入れた誤り（端で切り詰める・試行ごとに選び直す・分散の項の落とし・引きずられるの重みの落とし）で、それぞれ落ちることを確かめた（PR に記録）
describe("1セットを起こす手順は、定義どおりの分布になる（k ごとの割合で）", () => {
  const N = 4000;
  const check = (m: Mechanism, seed: number) => {
    const r = createRandom(seed), want = enumerate(m), seen = Array(m.n + 1).fill(0);
    for (let i = 0; i < N; i++) seen[drawSet(r, m).reduce((a, b) => a + b, 0)]++;
    return want.map((p, k) => ({ k, p, f: seen[k] / N })).filter(({ p, f }) => Math.abs(f - p) > 5 * Math.sqrt(p * (1 - p) / N) + 1e-12);
  };
  it("引きずられる・混ざる・戻さずに取る（端の p を含む決まった条件）", () => {
    const cases: Mechanism[] = [
      { kind: "mix", n: 8, p: 0.5, spread: 0.2 }, { kind: "mix", n: 8, p: 0.05, spread: 0.2 }, { kind: "mix", n: 6, p: 0.9, spread: 0.3 },
      { kind: "streak", n: 8, p: 0.7, carry: 0.3 }, { kind: "streak", n: 8, p: 0.17, carry: 0.6 },
      { kind: "urn", n: 8, total: 12, success: 5 },
      { kind: "fatigue", n: 8, p: 0.5, drop: 0.5 }, { kind: "fatigue", n: 8, p: 0.1, drop: 0.3 },
    ];
    cases.forEach((m, i) => expect(check(m, 20261101 + i), JSON.stringify(m)).toEqual([]));
  });
});

// 確かめる対象：回を追って変わる起き方の言い分「平均は np のまま、散らばりは二項分布より小さい（2回以上・ずれ幅が0でないとき）」（stats2-course #161）。
// 想定する故障：ずれ幅を詰めずに端で切り詰める（平均の確率が p からずれる）・向きの取り違え（広がると言う）。見つけ方：どの n・p・drop でも式で比べる。
// 既存との違い：上の数え上げは式と定義の一致を見る。ここは実験室の文の言い分（向き）を見る
describe("回を追って変わる：平均は np、散らばりは二項分布より小さい", () => {
  it("n≧2・0＜p＜1・drop＞0 で小さく、それ以外は同じ", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), P, fc.double({ min: 0, max: 1, noNaN: true }), (n, p, drop) => {
      const got = mechanismMoments({ kind: "fatigue", n, p, drop }), b = modelMoments({ kind: "binom", n, p });
      expect(close(got.mean, n * p)).toBe(true);
      const d = Math.min(drop, p, 1 - p);
      if (n === 1 || d === 0) expect(close(got.variance, b.variance)).toBe(true);
      else {
        // 小さくなる量は Σ(pᵢ−p)²＝d²Σ(1−2i/(n−1))²（式で別に求める）。d がごく小さいと倍精度では差が0になるので、向きは d が見える大きさのときに見る
        let S = 0; for (let i = 0; i < n; i++) S += (1 - (2 * i) / (n - 1)) ** 2;
        expect(Math.abs(b.variance - got.variance - d * d * S)).toBeLessThanOrEqual(1e-9 * Math.max(1, b.variance));
        if (d > 1e-6) expect(got.variance).toBeLessThan(b.variance);
      }
    }), { numRuns: 300 });
  });
});
