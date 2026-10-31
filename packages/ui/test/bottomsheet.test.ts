// 下からの面の段の決め方（stats2-course #42）：離した位置と指の速さから、止まる段を決める
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DETENTS, rubber, snapDetent } from "../src/BottomSheet";

const H = { peek: 220, half: 440, full: 760 };

describe("止まる段", () => {
  it("ゆっくり離すと、いちばん近い段", () => {
    expect(snapDetent(230, 0, H)).toBe("peek");
    expect(snapDetent(400, 0, H)).toBe("half");
    expect(snapDetent(700, 0, H)).toBe("full");
  });
  it("速く払うと、払った向きに少なくとも1段進む", () => {
    expect(snapDetent(260, 0.8, H)).toBe("half");    // 上へ払う
    expect(snapDetent(460, -0.8, H)).toBe("peek");   // 下へ払う
    expect(snapDetent(450, 0.8, H)).toBe("full");
  });
  it("どの高さ・速さでも、いずれかの段に止まる。速さの向きと逆へは戻らない", () => {
    fc.assert(fc.property(fc.double({ min: 150, max: 820, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), (h, v) => {
      const d = snapDetent(h, v, H);
      expect(DETENTS).toContain(d);
      if (v > 0.5) expect(H[d]).toBeGreaterThanOrEqual(nearestBelowOrAt(h));
      if (v < -0.5) expect(H[d]).toBeLessThanOrEqual(nearestAboveOrAt(h));
    }));
  });
});

const nearestBelowOrAt = (h: number) => Math.max(...Object.values(H).filter((x) => x <= h + 1), H.peek);
const nearestAboveOrAt = (h: number) => Math.min(...Object.values(H).filter((x) => x >= h - 1), H.full);

describe("端のゴム", () => {
  it("範囲の中はそのまま、外は越えた量より少なくしか伸びない", () => {
    expect(rubber(300, 220, 760)).toBe(300);
    fc.assert(fc.property(fc.double({ min: 1, max: 400, noNaN: true }), (x) => {
      expect(rubber(760 + x, 220, 760) - 760).toBeLessThanOrEqual(4 * Math.sqrt(x) + 1e-9);
      if (x > 16) expect(rubber(760 + x, 220, 760) - 760).toBeLessThan(x);
      expect(rubber(760 + x, 220, 760)).toBeGreaterThan(760);
      expect(rubber(220 - x, 220, 760)).toBeLessThan(220);
    }));
  });
});
