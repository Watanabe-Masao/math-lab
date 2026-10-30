# packages/ui/tokens.json の改訂（元は knowledge-net の design/tokens.json）

教材（stats2-course）は写しを持つ。値を変えたら `x-revision` を1つ上げ、ここに書く。教材の側は写しを取り込み直す。

- 1（2026-10-30）：src/ui/tokens.css から移す。動き（dur-press・dur・dur-flash・ease・press-scale）、結果の色（flash・good・bad）、解説の色（accent-line・focus・mark）、データの色（data-1・data-hi・data-2・data-3 と淡い色。ラボと静止図で同じ。ライト・ダークとも色覚の違いで見分けられることを確かめた）を足す。シート（dur-sheet・ease-sheet・scrim）。
- 2（2026-10-30）：knowledge-net の design/tokens.json から math-lab の packages/ui/tokens.json へ移す（#107）。値は同じ。
