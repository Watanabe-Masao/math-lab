# このリポジトリでの作業ルール

統計を発見する環境の土台。**計算**（種つき乱数・実験エンジン・式の木）と**画面の部品**（手触りの値・シート・切り替え・式の木の表示・積み上がる分布）を置く。利用者（渡辺さん）は iPhone で使う。文章は日本語の常体。
決定の元は stats2-course の #107（技術スタック）と docs/roadmap.md（計画）。作業は stats2-course の issue で管理する（最終ゴール #55）。

## 在り方

統計を発見するための環境。予測する・実験する・観察する・考える。公式を覚えるだけでは身に付かない統計的思考を、自らの実験と発見の体験で育てる。ここの部品は、その体験を正しく・気持ちよく起こすためにある。

## 形

| 場所 | 中身 | 守ること |
| --- | --- | --- |
| packages/engine | 画面を持たない計算（純粋関数） | DOM・React を使わない（tsconfig の lib に DOM を入れない）。Math.random を使わず、種つき乱数（createRandom）だけ |
| packages/ui | 画面の部品（Button・Card などの並べ方・Segmented・Sheet・motion）と手触りの値（tokens.json → src/tokens.css） | 計算は engine を呼ぶだけ。色の値は tokens.json にだけ書き、動きの長さは変数で（npm run design が止める）。tokens.json を変えたら `npm run tokens` で src/tokens.css を作り直し、改訂（x-revision）を上げて CHANGELOG に書く |

使う側：knowledge-net（入口・地図・実験室のサイト）は packages の写しを持ち、math-lab の決まった版と同じかを確かめる。教材（stats2-course）は tokens.json の写しを持つ（ずれたら check_all が止まる）。

## 守ること

1. **確率の計算と見た目の動きを分ける**。engine は数だけを返す。コインが返る・棒が積まれるのは ui。
2. **再現できる**。乱数は種つきだけ。種を画面に出せるようにし、同じ種なら同じ結果。決まった種の最初の値をテストで固定する（方式を変えると既存の実験の再現が崩れるので、変えるときは版を上げて理由を書く）。
3. **性質で確かめる**。Vitest＋fast-check で「同じ種なら同じ」「範囲」「回数を増やすと理論に近づく（許す幅は標準誤差の5倍）」を確かめる。例の数だけで済ませない。
4. **式は木で持つ**。式の木の型は knowledge-net の schema（formulaNode）に合わせる。木から TeX・記号の表・1段ずつの展開を作る。
5. **作業はブランチ**で行い、PR で GitHub のチェック（`npm run check`）が通ってからマージする。

## 確かめる

`npm run check`（デザインの決まり → 型の検査 → 単体テスト）。部品の画面のテスト（Playwright）は今は使う側（knowledge-net）にある。
