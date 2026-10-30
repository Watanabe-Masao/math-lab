// 意味のかたまりと分布（#110）：式の木の中の節を path で指す。作業台で、かたまりを押す・今の値を出す・分布を並べる。
import { isOp, type FormulaNode } from "./types";
import { evaluate, type Env } from "./evaluate";

/** 根からの args の番号で節を探す（[1, 0] は右辺の1つ目の因子） */
export function nodeAt(tree: FormulaNode, path: number[]): FormulaNode | undefined {
  let n: FormulaNode | undefined = tree;
  for (const i of path) n = n && isOp(n) ? n.args[i] : undefined;
  return n;
}

/** 等しい式の右辺（なければ木そのもの） */
export const rhsOf = (tree: FormulaNode): FormulaNode => (isOp(tree) && tree.op === "eq" ? tree.args[tree.args.length - 1]! : tree);
/** 等しい式の左辺 */
export const lhsOf = (tree: FormulaNode): FormulaNode | undefined => (isOp(tree) && tree.op === "eq" ? tree.args[0] : undefined);

/** 横軸の記号 over を lo〜hi の整数で動かしたときの右辺の値（確率の分布など）。計算できない所は undefined */
export function distribution(tree: FormulaNode, over: string, lo: number, hi: number, env: Env = {}): { x: number; y: number | undefined }[] {
  const body = rhsOf(tree), out: { x: number; y: number | undefined }[] = [];
  for (let x = Math.ceil(lo); x <= Math.floor(hi); x++) {
    const y = evaluate(body, { ...env, values: { ...env.values, [over]: x } });
    out.push({ x, y: y !== undefined && Number.isFinite(y) ? y : undefined });
  }
  return out;
}
