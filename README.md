# math-lab

統計を発見する環境の土台。計算（種つき乱数・実験エンジン・式の木）と画面の部品を置く。使う側は [knowledge-net](https://github.com/Watanabe-Masao/knowledge-net)（入口・地図・実験室のサイト）。

- `packages/engine`：画面を持たない計算（TypeScript の純粋関数）
- `packages/ui`：画面の部品と手触りの値（React。knowledge-net から移す）

```
npm ci
npm run check   # 型の検査と単体テスト（Vitest＋fast-check）
```
