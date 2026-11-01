// @math-lab/engine：画面を持たない計算（純粋関数）。DOM・React を使わない（tsconfig の lib に DOM を入れない）。
export { createRandom, normal, normalizeSeed, sampleWithout, shuffle, type Random } from "./random";
export * from "./formula";
export { sampleDiscrete, runTrials, emptyRecord, frequencies, type Dist, type Record as TrialRecord } from "./experiment";
export { MAX_CARDS, MAX_CARD_DRAWS, MAX_CARD_N, MAX_CARD_SETS, decodeCard, decodeCards, encodeCard, encodeCards, recordOfCard, type Card, type CardMechanism } from "./cards";
export { checkMechanism, drawSet, mechanismMoments, mixSpread, fatigueDrop, fatigueP, modelPmf, modelOf, modelMoments, emptySetRecord, runSets, summarize, supportOf, type Mechanism, type Model, type SetRecord } from "./lab";
