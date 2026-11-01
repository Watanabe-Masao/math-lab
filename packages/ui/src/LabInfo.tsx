// 実験室の「基本」の面の型（stats2-course issue 158 I1〜I3）。どの実験室も同じ欄を同じ順に出す：
// 1 式（作業台の「式＋帯」と同じ部品。記号を押すと意味と今の値、定義の式に開ける）→ 2 ポイント → 3 この概念を開く → 4 関連する概念（本体以外）
import type { ReactNode } from "react";
import { Sheet } from "./Sheet";
import s from "./Experiment.module.css";

export function LabInfo({ title, formula, points, main, related, name, onConcept, onClose }: {
  title: string;
  /** 式の欄（Workspace の only="formula"） */
  formula?: ReactNode;
  points?: string[];
  /** 実験室の本体の概念（関連の一覧には入れず、開く入口として分ける） */
  main?: string;
  /** 実験室がつなぐ概念（本体は除いて出す） */
  related?: string[];
  name: (id: string) => string;
  onConcept?: (id: string) => void;
  onClose: () => void;
}) {
  const others = (related ?? []).filter((id) => id !== main);
  return (
    <Sheet label="基本と用語" title={title.replace(/ ?実験室$/, "の基本")} onClose={onClose} data-testid="exp-info">
      {formula && <div data-testid="exp-info-formula">{formula}</div>}
      {points?.length ? <><p className={s.h}>ポイント</p><ul className={s.points} data-testid="exp-info-points">{points.map((t) => <li key={t}>{t}</li>)}</ul></> : null}
      {main && onConcept && <button type="button" className={s.link} onClick={() => onConcept(main)} data-testid="exp-info-main">{name(main)} のページを開く</button>}
      {others.length > 0 && <>
        <p className={s.h}>関連する概念</p>
        <div className={s.chips} data-testid="exp-info-related">{others.map((id) => <button key={id} type="button" className={s.chip} onClick={() => onConcept?.(id)}>{name(id)}</button>)}</div>
      </>}
    </Sheet>
  );
}
