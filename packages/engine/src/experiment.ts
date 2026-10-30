// 実験エンジン（stats2-course #102・#110）：パラメータと乱数で、実際にどんな結果になるかを起こす。画面を持たない。
// 理論の分布（distribution で並べた確率）から、種つき乱数で1回ずつ値を引く（累積確率で引く方法）。どの離散分布でも同じ。
import type { Random } from "./random";

export type Dist = { x: number; y: number | undefined }[];

/** 分布から1つ引く（確率の合計が1でなくても、合計で割って扱う） */
export function sampleDiscrete(rng: Random, dist: Dist): number {
  const total = dist.reduce((s, d) => s + Math.max(0, d.y ?? 0), 0);
  if (!(total > 0)) throw new RangeError("確率がすべて0の分布からは引けない");
  let u = rng.next() * total;
  for (const d of dist) { u -= Math.max(0, d.y ?? 0); if (u < 0) return d.x; }
  return dist[dist.length - 1]!.x;   // 丸めの誤差で最後まで来たとき
}

/** 記録：引いた値の並びと、値ごとの回数・平均 */
export type Record = { values: number[]; counts: Map<number, number>; mean: number | undefined };

export function emptyRecord(): Record { return { values: [], counts: new Map(), mean: undefined }; }

/** count 回引いて記録に足す（元の記録は変えない） */
export function runTrials(rng: Random, dist: Dist, count: number, rec: Record = emptyRecord()): Record {
  const values = [...rec.values], counts = new Map(rec.counts);
  for (let i = 0; i < count; i++) { const x = sampleDiscrete(rng, dist); values.push(x); counts.set(x, (counts.get(x) ?? 0) + 1); }
  return { values, counts, mean: values.length ? values.reduce((s, v) => s + v, 0) / values.length : undefined };
}

/** 値ごとの割合（回数 ÷ 全体） */
export function frequencies(rec: Record): Map<number, number> {
  const n = rec.values.length, out = new Map<number, number>();
  for (const [x, c] of rec.counts) out.set(x, c / n);
  return out;
}
