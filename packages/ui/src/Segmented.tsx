// 切り替え（1つだけ選ぶ。もう一度押すと閉じる）。Radix の ToggleGroup。
// 手触り：選んだ印（台の上の白い面）が、前の項目から横に滑って移る。押した瞬間に項目が少し沈み、iPhone では軽く振動する（試み）。
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { haptic } from "./motion";
import s from "./Segmented.module.css";

type Props = { value: string; onChange: (v: string) => void; items: { value: string; label: ReactNode }[]; label: string };

export function Segmented({ value, onChange, items, label }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<CSSProperties>({ opacity: 0 });
  const moved = useRef(false);
  useLayoutEffect(() => {
    const on = root.current?.querySelector<HTMLElement>('[data-state="on"]');
    if (!on) { setMark((m) => ({ ...m, opacity: 0 })); return; }
    // 最初に出るときは滑らせない（その場に置く）。2回目からは前の位置から滑る
    setMark({ opacity: 1, width: on.offsetWidth, height: on.offsetHeight, transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)`, transition: moved.current ? undefined : "none" });
    moved.current = true;
  }, [value, items.length]);
  const choose = (v: string) => { haptic(); onChange(v); };
  return (
    <ToggleGroup.Root ref={root} type="single" value={value} onValueChange={choose} className={s.root} aria-label={label}>
      <span className={s.mark} style={mark} aria-hidden="true" data-testid="segmented-mark" />
      {items.map((it) => <ToggleGroup.Item key={it.value} value={it.value} className={s.item}>{it.label}</ToggleGroup.Item>)}
    </ToggleGroup.Root>
  );
}
