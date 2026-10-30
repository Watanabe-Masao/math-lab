// 式の木（#72）：型・TeX を作る・値を求める・1段ずつ展開する・検査する。
export * from "./types";
export { toTex, symbolTex, formatNum, type TexOptions } from "./tex";
export { evaluate, expand, substitute, symbolsIn, factorial, comb, type Env } from "./evaluate";
export { validateFormula } from "./validate";
export { definitionsFor, openSymbol, applyOpens, type Definition, type Opened } from "./open";
