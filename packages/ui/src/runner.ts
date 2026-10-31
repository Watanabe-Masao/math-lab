// 実行中の処理（実験を少しずつ流すタイマー）を1か所で持つ（stats2-course #142：リセットは実行中の処理まで含めて終わらせる）。
// 止めると「世代」が進み、止める前に予約された更新が後から届いても捨てる。リセット・条件の変更・画面を閉じるときは stop を呼ぶだけでよい。
import { useEffect, useRef } from "react";

export function useRunner() {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gen = useRef(0);
  const stop = () => { gen.current++; if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  /** tick をすぐ1回と、その後 ms ごとに呼ぶ。tick が true（終わった）を返すか stop されたら止まる。止めた後に届いた tick は何もしない */
  const start = (tick: () => boolean, ms: number) => {
    stop();
    const g = gen.current;
    const t = () => { if (g !== gen.current) return; if (tick()) stop(); };
    t();
    if (g === gen.current) timer.current = setInterval(t, ms);
  };
  return { start, stop };
}
