// 記録カード（stats2-course #122）：実験室の「比べる」の段で、学習者が決めた条件を残す。
// 残すのは条件と種とセット数だけ。種つき乱数なので、同じカードからはいつでも同じ記録が作り直せる（平均・散らばり・山は開くたびに計算する）。
// URL に入れられる短い文字にする（例：b10_0.5_100_74290 ＝ n＝10・p＝0.5・100 セット・種 74290）。
import { createRandom } from "./random";
import { checkMechanism, emptySetRecord, runSets, type Mechanism, type SetRecord } from "./lab";

/** カードにできる起き方：独立で毎回同じ p（二項分布）と、値の表から1回引く（値は実験の定義から入るので、カードは重みだけ持つ） */
export type CardMechanism = { kind: "bernoulli"; n: number; p: number } | { kind: "table"; n: 1; values: number[]; weights: number[] };
export type Card = { mechanism: CardMechanism; sets: number; seed: number };

/** カード1枚が持てるセット数の上限（URL から大きすぎる数を入れられて画面が止まらないように） */
export const MAX_CARD_SETS = 100000;
/** 共有カードの1セットの回数（n）の上限と、作り直すときに起こす回の合計（n×セット数）の上限。
 *  URL は誰でも書けるので、開いたときに大きな配列・計算で画面が固まらないようにする（#142：n＝10億が受理されていた） */
export const MAX_CARD_N = 1000;
export const MAX_CARD_DRAWS = 2_000_000;
/** URL に入れるカードの数の上限 */
export const MAX_CARDS = 8;

const num = (v: number) => String(Number(v.toPrecision(12)));

/** 1枚を短い文字に（値の表の値は入れない。定義から入る） */
export function encodeCard(c: Card): string {
  const m = c.mechanism;
  const head = m.kind === "bernoulli" ? `b${m.n}_${num(m.p)}` : `t${m.weights.map(num).join("~")}`;
  return `${head}_${c.sets}_${c.seed}`;
}

export function encodeCards(cs: Card[]): string {
  return cs.slice(0, MAX_CARDS).map(encodeCard).join(",");
}

const isInt = (s: string) => /^\d+$/.test(s);
const isNum = (s: string) => /^\d+(\.\d+)?(e-?\d+)?$/.test(s);

/** 文字から1枚に戻す。形が違う・条件が成り立たない・大きすぎるときは undefined（理由は言わずに捨てる。URL は誰でも書けるので） */
export function decodeCard(s: string, ctx: { values?: number[] } = {}): Card | undefined {
  const parts = s.split("_");
  if (parts.length < 3) return undefined;
  const [seedS, setsS] = [parts.at(-1)!, parts.at(-2)!];
  if (!isInt(seedS) || !isInt(setsS)) return undefined;
  const sets = Number(setsS), seed = Number(seedS);
  if (sets > MAX_CARD_SETS || seed > 2 ** 32) return undefined;
  let mechanism: CardMechanism;
  if (s[0] === "b" && parts.length === 4) {
    const nS = parts[0]!.slice(1), pS = parts[1]!;
    if (!isInt(nS) || !isNum(pS)) return undefined;
    mechanism = { kind: "bernoulli", n: Number(nS), p: Number(pS) };
  } else if (s[0] === "t" && parts.length === 3 && ctx.values) {
    const ws = parts[0]!.slice(1).split("~");
    if (!ws.every(isNum) || ws.length !== ctx.values.length) return undefined;
    mechanism = { kind: "table", n: 1, values: ctx.values, weights: ws.map(Number) };
  } else return undefined;
  if (checkMechanism(mechanism as Mechanism)) return undefined;
  if (mechanism.n > MAX_CARD_N || mechanism.n * sets > MAX_CARD_DRAWS) return undefined;
  return { mechanism, sets, seed };
}

export function decodeCards(s: string, ctx: { values?: number[] } = {}): Card[] {
  if (!s) return [];
  return s.split(",").slice(0, MAX_CARDS).map((x) => decodeCard(x, ctx)).filter((c): c is Card => c !== undefined);
}

/** カードから記録を作り直す（同じカードなら、いつ・何回に分けて起こしても同じ記録） */
export function recordOfCard(c: Card): SetRecord {
  return runSets(createRandom(c.seed), emptySetRecord(c.seed, c.mechanism as Mechanism), c.sets);
}
