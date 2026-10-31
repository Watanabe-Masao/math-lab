// 予想の向きのボタンと値（スライダー）を連動させる（渡辺さん 2026-10-31）。
// 「右へ」を押すたびに1目盛り右へ（6 → 7 → 8）。逆の側にいるときに「左へ」を押すと、今の値の1つ左から（4 → 3 → 2）。
// 「動かない」は今の値に戻す。端では止まる。純粋な計算（テストで確かめる）
export function nudge(dir: number, value: number, base: number, step: number, lo: number, hi: number): number {
  if (dir === 1) return base;
  const s = dir === 2 ? 1 : -1;
  const same = s > 0 ? value > base : value < base;
  const next = same ? value + s * step : base + s * step;
  return Math.min(hi, Math.max(lo, Number(next.toPrecision(12))));
}
