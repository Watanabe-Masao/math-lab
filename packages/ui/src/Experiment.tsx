// 実験室（stats2-course #102・issue 161）：入口「何を確かめたい？」から問いを選び、予測 → 実験 → 観察 → 理由 → 応用 を1画面に1段ずつ。
// - 実験の定義（ExperimentDef）はデータ。画面は読むだけ（テーマ・使えない場面・次の問いは定義を足すだけで増える）
// - 予想するまで結果を見せない。予想の答えは定義に書かず、理論のモデルから求める
// - 起き方（engine の Mechanism）と理論のモデルを分ける：反例は、成り立つ条件を1つ崩した起き方で、二項の理論とのずれを見る
// - 発見メモは ChatGPT に渡す（公開サイトは個人の記録を持たない。ChatGPT が Notion の学習記録へ書く）
import { useState, type CSSProperties, type ReactNode } from "react";
import { modelPmf, type CardMechanism } from "@math-lab/engine";
import { LabShell, peak, r2, tex } from "./labParts";
import { TableLab, type TableDef } from "./ExperimentTable";
import { BreakQ, ConvQ, ProbQ, QuestionMenu, ShiftQ, SpreadQ, type MenuGroup, type MenuItem } from "./ExperimentQuestion";
import { CompareStage, copyHere, hereUrl, useCards } from "./Compare";
import { LabInfo } from "./LabInfo";
import type { FormulaData } from "./Formula";
import { Workspace, type WorkspaceData } from "./Workspace";
import s from "./Experiment.module.css";

type Cond = { n: number; p: number };
type Range = { min: number; max: number; step: number };
export type ExperimentTheme = { id: string; name: string; icon: string; success: string; failure: string; unit?: string; p?: number; story?: string };
/** 実験室の定義。model で形が分かれる（binom：成功の回数の山、table：値の表の平均。#119） */
export type ExperimentDef = BinomDef | TableDef;
export type BinomDef = {
  id: string; version: number; title: string; question: string;
  links: { concepts?: string[]; relations?: string[] };
  model: "binom";
  vary: { n: Range; p: Range };
  start: Cond; compare: Partial<Cond>;
  reason?: { title: string; concept?: string; formula?: number; steps: string[] };
  themes: ExperimentTheme[];
  /** 反例を実験する：成り立つ条件（breaks）を1つ崩した起き方で、理論とのずれを見る。数は概念しだい */
  counterexamples?: { id: string; name: string; breaks: string; mechanism: { kind: "urn" | "streak" | "mix" | "fatigue"; total?: number; success?: number; carry?: number; spread?: number; drop?: number }; text: string; concept?: string }[];
  next?: { question: string; set: Partial<Cond> }[];
  points?: string[];
  /** 入口「何を確かめたい？」に並べる問い（stats2-course issue 161）。form は問いの形 */
  questions?: (
    | { id: string; form: "prob"; title: string; question: string; set: Cond; events: { op: "eq" | "ge" | "le"; k: number }[]; free?: boolean }
    | { id: string; form: "spread"; title: string; question: string; set: Cond; to: { n: number } }
    | { id: string; form: "conv"; title: string; question: string; set: Cond; events: { op: "eq" | "ge" | "le"; k: number }[] }
  )[];
  /** 確率の値の問いの予想の目盛り（大きい順の境目） */
  prob_scale?: number[];
  /** テーマ体系（stats2-course issue 163）：まとまり（A〜F）の下に問い（id は 教材名:概念-まとまり-番号。stats2:binom-A-01）を並べる。open は開く入口
   *  （shift＝最初の問い・questions の id・break:反例の id・compare）。open のない問いは「作成中」として並べるだけ。
   *  concept（主概念）・related（関連概念）は問いの側で持ち、サイトが概念で問いを絞るのに使う。predict・operate・judge は問いごとの予測・操作・理解判定。
   *  開く先（実験の仕組み）は共有してよいが、open は問いごとに1つ（同じ画面を開くだけで別の問いにしない） */
  catalog?: { id: string; title: string; items: { id: string; title: string; finds?: string; predict?: string; operate?: string; judge?: string; open?: string; concept?: string; related?: string[] }[] }[];
};

export type Props = {
  def: ExperimentDef;
  /** 理由の段で使う式（定義の reason.concept の reason.formula。E(X)＝np など） */
  reasonFormula?: FormulaData;
  /** ⓘ に出す主役の式（P(X＝k)＝…） */
  mainFormula?: FormulaData;
  seed?: number;
  onConcept?: (id: string) => void;
  conceptName?: (id: string) => string;
  /** 発見メモを送る（既定：ChatGPT を開いて文を渡す） */
  onSendMemo?: (text: string) => void;
  /** 戻る（概念のページへ） */
  onBack?: () => void;
  /** 概念の式（記号を定義の式で開く。E → Σ k P(X＝k) など） */
  definitions?: (conceptId: string) => FormulaData[];
  /** 理由の段に置く式の作業台（概念の workspace と同じもの。今の条件の値で始める） */
  workspace?: { formula: WorkspaceData; mean?: FormulaData; vary: string[]; over: string };
  /** 比べるの記録カード（URL の cmp。あれば比べるの段から開く）。issue 122 */
  cards?: string;
  /** 記録カードが変わったとき（親が URL に書く） */
  onCards?: (encoded: string) => void;
  /** 入口を通さずに開く問い（stats2-course issue 163。shift・questions の id・break:反例の id・compare）。
   *  外の一覧（サイトの実験室のタブ）から開いたときに使い、問いの「戻る」は onBack（外の一覧）へ */
  open?: string;
};



export function Experiment(props: Props) {
  return props.def.model === "table" ? <TableLab {...props} def={props.def} /> : <BinomEntry {...props} def={props.def} />;
}

/** 二項分布の実験室（stats2-course issue 161）：入口「何を確かめたい？」から問いを選ぶ。どの問いも 予測→実験→観察→理由→応用。
 *  比べる（記録カード）は実験室に1か所。URL にカード（cmp）があれば比べるから開く */
function BinomEntry(props: Props & { def: BinomDef }) {
  const { def } = props;
  const [pick, setPick] = useState<string | null>(props.open ?? (props.cards ? "compare" : null));
  const [info, setInfo] = useState(false);
  const [grp, setGrp] = useState<string | null>(null);   // 入口で選んだまとまり（問いから戻ったときも同じまとまりを出す）
  const name = (id: string) => props.conceptName?.(id) ?? id;
  const ws = props.workspace;
  const deck = useCards({ storeKey: `math-lab:cards:${def.id}`, initial: props.cards, onCards: props.onCards, start: () => [] });
  const menu = () => (props.open ? props.onBack?.() : setPick(null));
  const infoSheet = info && (
    <LabInfo title={def.title} points={def.points} main={def.reason?.concept ?? def.links.concepts?.[0]} related={def.links.concepts} name={name} onConcept={props.onConcept} onClose={() => setInfo(false)}
      formula={ws ? <Workspace only="formula" formula={ws.formula} vary={ws.vary} over={ws.over} initial={{ n: def.start.n, p: def.start.p, [ws.over]: peak(modelPmf({ kind: "binom", ...def.start })) }} definitions={props.definitions} onConcept={props.onConcept} conceptName={props.conceptName} experiment={false} />
        : props.mainFormula?.tex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(props.mainFormula.tex) }} />} />
  );
  const send = (t: string) => {
    if (props.onSendMemo) { props.onSendMemo(t); return; }
    try { void navigator.clipboard?.writeText(t); } catch { /* コピーできない環境では URL だけで渡す */ }
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(t)}`, "_blank", "noopener");
  };
  const common = {
    def, seed: props.seed, onBack: menu, onMenu: menu, onInfo: () => setInfo(true), onMemo: send,
    onKeep: (m: CardMechanism) => deck.add({ mechanism: m, sets: 100, seed: Date.now() % 100000 }),
    workspace: ws ? (c: { n: number; p: number }, k: number) => <Workspace key={`${c.n}-${c.p}-${k}`} formula={ws.formula} mean={ws.mean} vary={ws.vary} over={ws.over} initial={{ n: c.n, p: c.p, [ws.over]: k }} definitions={props.definitions} onConcept={props.onConcept} conceptName={props.conceptName} experiment={false} /> : undefined,
    conceptLink: (id: string) => props.onConcept && <button type="button" className={s.link} onClick={() => props.onConcept!(id)}>{name(id)} を見る</button>,
  };
  if (pick === null) {
    if (def.catalog?.length) {
      const formOf = (open: string): MenuItem["form"] => open === "shift" ? "shift" : open.startsWith("break:") ? "break" : def.questions?.find((q) => q.id === open)?.form ?? "shift";
      const short = (id: string) => id.replace(/^.*-([A-Z]-\d+)$/, "$1");   // stats2:binom-A-01 → A-01（まとまりの中の番号）
      const groups: MenuGroup[] = def.catalog.map((g) => ({ id: g.id, title: g.title, items: g.items.map((it): MenuItem => it.open ? { id: it.open, key: short(it.id), form: formOf(it.open), title: it.title } : { id: it.id, key: short(it.id), form: "shift", title: it.title, draft: true }) }));
      // 比べるは A〜F の後ろに、まとまりの1つとして置く（下に別のカードで重ねない。渡辺さん 2026-11-02）
      groups.push({ id: "compare", title: "自分で条件を決めて比べる", note: `カード ${deck.cards.length} 枚`, items: [{ id: "compare", form: "compare", title: "自分で条件を決めて比べる", sub: `記録カード ${deck.cards.length} 枚。条件や起き方を変えて残し、4 つまで重ねる` }] });
      return <QuestionMenu title={def.title} groups={groups} group={grp ?? undefined} onGroup={setGrp} onPick={setPick} onBack={props.onBack} onInfo={() => setInfo(true)}>{infoSheet}</QuestionMenu>;
    }
    const items: MenuItem[] = [
      { id: "shift", form: "shift", title: def.question },
      ...(def.questions ?? []).map((q) => ({ id: q.id, form: q.form, title: q.title, sub: q.question })),
      ...(def.counterexamples?.length ? [{ id: "break", form: "break" as const, title: "成り立つ条件を崩してみる", sub: def.counterexamples.map((x) => x.name).join("・") }] : []),
      { id: "compare", form: "compare", title: "自分で条件を決めて比べる", sub: `記録カード ${deck.cards.length} 枚。条件や起き方を変えて残し、4 つまで重ねる` },
    ];
    return <QuestionMenu title={def.title} items={items} onPick={setPick} onBack={props.onBack} onInfo={() => setInfo(true)}>{infoSheet}</QuestionMenu>;
  }
  if (pick === "shift") return <ShiftQ {...common}>{infoSheet}</ShiftQ>;
  if (pick === "break" || pick.startsWith("break:")) return <BreakQ key={pick} {...common} initial={pick.slice(6) || undefined}>{infoSheet}</BreakQ>;
  if (pick === "compare") return <BinomCompare def={def} deck={deck} onBack={menu} onInfo={() => setInfo(true)} onMemo={send}>{infoSheet}</BinomCompare>;
  const q = def.questions?.find((x) => x.id === pick);
  if (!q) return null;
  if (q.form === "spread") return <SpreadQ {...common} q={q}>{infoSheet}</SpreadQ>;
  if (q.form === "conv") return <ConvQ {...common} q={q}>{infoSheet}</ConvQ>;
  return <ProbQ {...common} q={q}>{infoSheet}</ProbQ>;
}

const KINDS: [CardMechanism["kind"], string][] = [["bernoulli", "条件どおり（二項分布）"], ["streak", "前の結果に引きずられる"], ["mix", "日によって確率が違う"], ["fatigue", "疲れて確率が下がる"], ["urn", "箱から戻さずに取る"]];
const STR: Record<string, [string, number, number, number]> = { streak: ["引きずる強さ", 0.05, 0.6, 0.05], mix: ["ずれ幅 d", 0.05, 0.4, 0.05], fatigue: ["下がる幅 d", 0.05, 0.4, 0.05], urn: ["箱の数", 12, 60, 2] };
/** 比べる（実験室に1か所）：起き方・n・p・強さを決めてカードに残し、4つまで重ねる */
function BinomCompare({ def, deck, onBack, onInfo, onMemo, children }: { def: BinomDef; deck: ReturnType<typeof useCards>; onBack: () => void; onInfo: () => void; onMemo: (t: string) => void; children?: ReactNode }) {
  const [d, setD] = useState<{ kind: CardMechanism["kind"]; n: number; p: number; x: number }>({ kind: "bernoulli", n: def.start.n, p: def.start.p, x: 0.3 });
  const [memo, setMemo] = useState("");
  const draft: CardMechanism = d.kind === "streak" ? { kind: "streak", n: d.n, p: d.p, carry: d.x } : d.kind === "mix" ? { kind: "mix", n: d.n, p: d.p, spread: d.x }
    : d.kind === "fatigue" ? { kind: "fatigue", n: d.n, p: d.p, drop: d.x } : d.kind === "urn" ? (() => { const total = Math.max(d.n, Math.round(d.x)); return { kind: "urn", n: d.n, total, success: Math.round(d.p * total) } as CardMechanism; })()
    : { kind: "bernoulli", n: d.n, p: d.p };
  const describe = (m: CardMechanism) => {
    const kind = KINDS.find(([k]) => k === m.kind)?.[1] ?? "";
    if (m.kind === "bernoulli") return `n＝${m.n}・p＝${r2(m.p)}`;
    if (m.kind === "urn") return `${kind}・n＝${m.n}・箱 ${m.total}（当たり ${m.success}）`;
    if (m.kind === "table") return "";
    const x = m.kind === "streak" ? m.carry : m.kind === "mix" ? m.spread : m.drop;
    return `${kind}・n＝${m.n}・p＝${r2(m.p)}・${STR[m.kind]![0]} ${r2(x)}`;
  };
  const sg = STR[d.kind];
  const body = <>
    <CompareStage deck={deck} describe={describe} draft={draft} onShare={() => copyHere()}
      editor={<div style={{ display: "grid", gap: 6 }}>
        <select className={s.select} value={d.kind} aria-label="起き方" onChange={(e) => { const k = e.target.value as CardMechanism["kind"]; setD({ ...d, kind: k, x: STR[k] ? Math.min(STR[k]![2], Math.max(STR[k]![1], k === "urn" ? 40 : d.x > 1 ? 0.3 : d.x)) : d.x }); }} data-testid="cmp-kind">
          {KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        {(["n", "p"] as const).map((key) => {
          const r = def.vary[key], v = d[key];
          return <label key={key} className={s.peak}><span>{key === "n" ? "回数 n" : "成功確率 p"}</span><b>{key === "p" ? r2(v) : v}</b>
            <input type="range" min={r.min} max={r.max} step={r.step} value={v} onChange={(e) => setD({ ...d, [key]: Number(e.target.value) })} style={{ "--fill": `${((v - r.min) / (r.max - r.min)) * 100}%` } as CSSProperties} aria-label={`比べる条件の ${key}`} data-testid={`cmp-${key}`} /></label>;
        })}
        {sg && <label className={s.peak}><span>{sg[0]}</span><b>{d.x}</b><input type="range" min={sg[1]} max={sg[2]} step={sg[3]} value={d.x} onChange={(e) => setD({ ...d, x: Number(e.target.value) })} style={{ "--fill": `${((d.x - sg[1]) / (sg[2] - sg[1])) * 100}%` } as CSSProperties} aria-label={sg[0]} data-testid="cmp-x" /></label>}
      </div>} />
    <section className={s.card}>
      <p className={s.h}>発見メモ<span>ChatGPT に渡して学習記録へ</span></p>
      <textarea className={s.memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたこと・考えたこと（例：n を2倍にすると散らばりも2倍。疲れると山は狭くなる）" aria-label="発見メモ" />
      <button type="button" className={s.secondary} onClick={() => onMemo(["【学習記録】実験室", `実験：${def.title}（${def.id}）`, "比べる", `比べた条件：${deck.cards.map((c) => `${describe(c.mechanism)}（${c.sets} セット・種 ${c.seed}）`).join("、") || "—"}`, `再現の URL：${hereUrl()}`, `メモ：${memo || "—"}`, `日時：${new Date().toISOString()}`, "→ この内容を Notion の学習記録（学習ログ）に記録してください。"].join("\n"))} data-testid="exp-send">メモを ChatGPT に送る</button>
    </section>
  </>;
  return <LabShell title={def.title} question="自分で条件を決めて実験し、カードに残して重ねる" qLabel="比べる" stepper={false} stage={0} reached={0} go={() => {}} onBack={onBack} onInfo={onInfo} body={body} cta={null}>{children}</LabShell>;
}
