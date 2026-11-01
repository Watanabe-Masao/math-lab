// 種つき乱数（#102・#107）。同じ種なら、どの端末でも同じ並びになる。
// 実験の結果を再現する（「この実験をもう一度」）・テストで結果を固定するために使う。Math.random は使わない。
// 方式は mulberry32（32ビットの状態。速く、統計の学習用の実験には十分な質）。

export type Random = {
  /** 作ったときの種（画面に出して、同じ実験をもう一度起こせるようにする） */
  readonly seed: number;
  /** 0 以上 1 未満の一様な数 */
  next(): number;
  /** lo 以上 hi 以下の整数（両端を含む） */
  int(lo: number, hi: number): number;
  /** 確率 p で true */
  chance(p: number): boolean;
  /** 今の状態から分かれた乱数（元の並びを乱さずに、別の実験を起こす） */
  fork(): Random;
};

/** 種を 32 ビットの整数にそろえる（小数・負の数・大きな数でも同じ規則で）。 */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError(`種は有限の数：${seed}`);
  return Math.trunc(seed) >>> 0;
}

export function createRandom(seed: number): Random {
  const start = normalizeSeed(seed);
  let a = start;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Random = {
    seed: start,
    next,
    int(lo, hi) {
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new RangeError(`int(${lo}, ${hi})：整数で lo ≤ hi`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    chance(p) {
      if (!(p >= 0 && p <= 1)) throw new RangeError(`確率は 0〜1：${p}`);
      return next() < p;
    },
    fork() {
      return createRandom(Math.floor(next() * 4294967296));
    },
  };
  return r;
}

// ---- ラボが使う引き方（stats2-course #144 P6：教材のラボの乱数をここへ集める。ラボの中に乱数を書かない） ----

/** 標準正規分布の数（Box–Muller。u＝0 は引き直す。1回に2つ引く） */
export function normal(r: Random): number {
  let u = 0;
  while (u === 0) u = r.next();
  const v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 並べ替えた新しい配列（Fisher–Yates。元の配列は変えない） */
export function shuffle<T>(r: Random, xs: readonly T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** 戻さずに k 個を引く（並べ替えの先頭 k 個。k は 0〜長さ） */
export function sampleWithout<T>(r: Random, xs: readonly T[], k: number): T[] {
  if (!Number.isInteger(k) || k < 0 || k > xs.length) throw new RangeError(`引く数は 0〜${xs.length} の整数：${k}`);
  return shuffle(r, xs).slice(0, k);
}
