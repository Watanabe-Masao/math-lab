// 置き方の部品：カード・開閉・下から開く面・文字の段・札・入力欄。画面はこれと Button を組み合わせて作る。
import type { CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import s from "./Layout.module.css";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
type Div = HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" | "header" | "aside" };

/** 地より一段明るい面。tone="inset" はカードの中の一段沈んだ面 */
export function Card({ as: Tag = "section", tone = "surface", className, ...rest }: Div & { tone?: "surface" | "inset" }) {
  return <Tag className={cx(tone === "inset" ? s.inset : s.card, className)} {...rest} />;
}
export const Stack = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cx(s.stack, className)} {...rest} />;
export const Row = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cx(s.row, className)} {...rest} />;
/** 子を同じ幅で並べる（例：まわり／全体） */
export const Split = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cx(s.split, className)} {...rest} />;
export const Muted = ({ as: Tag = "p", className, ...rest }: HTMLAttributes<HTMLElement> & { as?: "p" | "span" | "div" }) => <Tag className={cx(s.muted, className)} {...rest} />;
export const Label = ({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) => <span className={cx(s.label, className)} {...rest} />;
export const ErrorText = (p: HTMLAttributes<HTMLParagraphElement>) => <p role="alert" className={s.error} {...p} />;

/** 札。color は tokens の変数名（例 "--k-conv"） */
export function Badge({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  const style: CSSProperties | undefined = color ? { color: `var(${color})` } : undefined;
  return <span className={s.badge} style={style} title={title}>{color && <span className={s.dot} />}{children}</span>;
}
export const Badges = ({ children }: { children: ReactNode }) => <span className={s.badges}>{children}</span>;

/** 開閉（見出しを押すと開く）。open を渡すと最初の状態 */
export function Disclosure({ summary, children, open, ...rest }: { summary: ReactNode; children: ReactNode; open?: boolean } & HTMLAttributes<HTMLDetailsElement>) {
  return <details className={s.disclosure} open={open} {...rest}><summary>{summary}</summary><div className={s.body}>{children}</div></details>;
}

export const Field = (p: InputHTMLAttributes<HTMLInputElement>) => <input className={s.field} {...p} />;
