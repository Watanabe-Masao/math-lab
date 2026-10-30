// 式の木（#72・#109）：型・TeX を作る・値を求める・1段ずつ展開する・検査する・記号を開く・スコープ・定義域。
export * from "./types";
export { toTex, symbolTex, formatNum, type TexOptions } from "./tex";
export { evaluate, expand, substitute, symbolsIn, fnsIn, factorial, comb, type Env } from "./evaluate";
export { validateFormula } from "./validate";
export { definitionsFor, openSymbol, applyOpens, substituteFree, type Definition, type Opened, type OpenOptions } from "./open";
export { freeSymbols, boundSymbols, renameBound, freshName } from "./scope";
export { inDomain, describeDomain, checkDomain, sliderRange, stopReason } from "./domain";
export { nodeAt, rhsOf, lhsOf, distribution } from "./parts";
