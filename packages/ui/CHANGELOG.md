# packages/ui/tokens.json の改訂（元は knowledge-net の design/tokens.json）

教材（stats2-course）は写しを持つ。値を変えたら `x-revision` を1つ上げ、ここに書く。教材の側は写しを取り込み直す。

- 1（2026-10-30）：src/ui/tokens.css から移す。動き（dur-press・dur・dur-flash・ease・press-scale）、結果の色（flash・good・bad）、解説の色（accent-line・focus・mark）、データの色（data-1・data-hi・data-2・data-3 と淡い色。ラボと静止図で同じ。ライト・ダークとも色覚の違いで見分けられることを確かめた）を足す。シート（dur-sheet・ease-sheet・scrim）。
- 2（2026-10-30）：knowledge-net の design/tokens.json から math-lab の packages/ui/tokens.json へ移す（#107）。値は同じ。
- 3（2026-10-31）：配色を「黒鉛と青緑」に替え、落ち着いた見た目に寄せる（stats2-course #42）。主の色は青緑（ライト #0f7f73・ダーク #4fbfae）。地・文字・線は青みの灰。角は 4・6・10px。線の種類の色は3色＋灰にまとめる：構造（導出・一般化・特殊化・統合）＝青、変換＝琥珀、対比＝紅、前提・応用＝灰（線の形と名前でも見分ける）。データの色は青・琥珀・紫・紅。3色（青・琥珀・紅）は全部の組で、4色（データ）は隣り合う組で、色覚の違いでも見分けられることを確かめた（OKLab の差 ≥ 8、ふつうの見え方 ≥ 15、地に対して 3:1 以上）。文字の太さは部品の中で 600 までにした。
