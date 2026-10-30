// @math-lab/engine：画面を持たない計算（純粋関数）。DOM・React を使わない（tsconfig の lib に DOM を入れない）。
export { createRandom, normalizeSeed, type Random } from "./random";
export * from "./formula";
export { sampleDiscrete, runTrials, emptyRecord, frequencies, type Dist, type Record as TrialRecord } from "./experiment";
