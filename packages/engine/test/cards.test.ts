// 記録カード（stats2-course #122）：条件と種だけを残し、URL を往復しても同じ記録に戻ることを性質で確かめる。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_CARDS, createRandom, decodeCard, decodeCards, emptySetRecord, encodeCard, encodeCards, recordOfCard, runSets, type Card } from "../src";

const values = [0, 100, 1000];
const card: fc.Arbitrary<Card> = fc.record({
  mechanism: fc.oneof(
    fc.record({ kind: fc.constant("bernoulli" as const), n: fc.integer({ min: 1, max: 40 }), p: fc.double({ min: 0, max: 1, noNaN: true }) }),
    fc.record({ kind: fc.constant("table" as const), n: fc.constant(1 as const), values: fc.constant(values),
      weights: fc.array(fc.oneof(fc.integer({ min: 0, max: 200 }), fc.double({ min: 0, max: 50, noNaN: true })), { minLength: 3, maxLength: 3 }) })
      .filter((m) => m.weights.some((w) => w > 0)),
  ),
  sets: fc.integer({ min: 0, max: 400 }),
  seed: fc.integer({ min: 0, max: 99999 }),
});

describe("記録カード", () => {
  it("文字にして戻すと同じカード（p と重みは12桁で丸める）", () => {
    fc.assert(fc.property(card, (c) => {
      const back = decodeCard(encodeCard(c), { values });
      expect(back).toBeDefined();
      expect(back!.sets).toBe(c.sets); expect(back!.seed).toBe(c.seed);
      const m = c.mechanism, b = back!.mechanism;
      if (m.kind === "bernoulli" && b.kind === "bernoulli") { expect(b.n).toBe(m.n); expect(b.p).toBeCloseTo(m.p, 10); }
      else if (m.kind === "table" && b.kind === "table") b.weights.forEach((w, i) => expect(w).toBeCloseTo(m.weights[i]!, 9));
      else throw new Error("形が変わった");
    }));
  });
  it("URL の文字は、そのまま使える文字だけ（区切りの , と _ と ~ と . と数字と b・t）", () => {
    fc.assert(fc.property(fc.array(card, { maxLength: 6 }), (cs) => {
      const s = encodeCards(cs);
      expect(s).toMatch(/^[0-9bt_~.,e-]*$/);
      expect(encodeURIComponent(s).replace(/%2C/g, ",")).toBe(s);
      expect(decodeCards(s, { values })).toHaveLength(cs.length);
    }));
  });
  it("同じカードから作り直した記録は、分けて起こした記録と同じ（何回に分けても）", () => {
    fc.assert(fc.property(card, fc.integer({ min: 1, max: 50 }), (c, chunk) => {
      const whole = recordOfCard(c);
      const rng = createRandom(c.seed);
      let r = emptySetRecord(c.seed, c.mechanism);
      for (let done = 0; done < c.sets; done += chunk) r = runSets(rng, r, Math.min(chunk, c.sets - done));
      expect(r.ks).toEqual(whole.ks); expect(r.counts).toEqual(whole.counts);
      expect(whole.sets).toBe(c.sets);
    }), { numRuns: 60 });
  });
  it("形の違う文字・成り立たない条件・大きすぎる数・値の数が合わない表は捨てる", () => {
    for (const bad of ["", "x", "b10_0.5_100", "b0_0.5_10_1", "b10_1.5_10_1", "b10_0.5_100001_1", "b10_-0.5_10_1", "t1~1_10_1", "t0~0~0_10_1", "b10_0.5_1e9_1", "b1.5_0.5_10_1"])
      expect(decodeCard(bad, { values })).toBeUndefined();
    expect(decodeCard("t1~1~1_10_1")).toBeUndefined();   // 値の表は、定義の値がないと戻せない
    expect(decodeCards("b10_0.5_10_1,ゴミ,b10_0.8_10_2")).toHaveLength(2);
  });
  it("カードは多くても決まった枚数まで", () => {
    const many = Array.from({ length: 20 }, (_, i) => `b10_0.5_10_${i}`).join(",");
    expect(decodeCards(many)).toHaveLength(MAX_CARDS);
  });
});
