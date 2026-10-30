// CSS Modules と CSS の読み込み（使う側の Vite が処理する）
declare module "*.module.css" { const classes: Record<string, string>; export default classes; }
declare module "*.css";
