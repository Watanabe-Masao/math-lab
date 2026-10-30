import type { ButtonHTMLAttributes } from "react";
import s from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 従（枠。既定）・主（塗り）・控えめ・文字だけ */
  variant?: "secondary" | "primary" | "quiet" | "link";
  block?: boolean; icon?: boolean; pressed?: boolean;
};

/** ボタンは4種類だけ。押す所は 44px（--tap）。 */
export function Button({ variant = "secondary", block, icon, pressed, className, ...rest }: Props) {
  const cls = [s.btn, variant !== "secondary" && s[variant], block && s.block, icon && s.icon, className].filter(Boolean).join(" ");
  return <button type="button" aria-pressed={pressed} className={cls} {...rest} />;
}
