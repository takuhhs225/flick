# Flick

開いた瞬間にメモが取れて、フリックでステータスを動かすタスク管理(Web、Mac 優先)。

- メモ: 開くと入力欄にフォーカス済み。Enter で未着手の先頭に追加。読み込み中に打った文字も失われない
- ステータス: カードを左右にフリック(トラックパッドの2本指スワイプ、矢印キー対応)。未着手 ⇄ 進行中 ⇄ 完了
- AI(Workers AI): タスク名を整える / サブタスクに分解
- ログイン: Google のみ

構成: Cloudflare Workers(Static Assets + Hono)/ D1 / Workers AI、フロントは React + Vite + motion。選定理由は [DESIGN.md](DESIGN.md)。

## セットアップ

```sh
npm install
npx wrangler d1 create flick          # 出力された database_id を wrangler.jsonc に貼る
npm run db:migrate:remote
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

Google Cloud Console で OAuth クライアント(ウェブアプリ)を作り、承認済みリダイレクト URI に
`https://<デプロイ先ホスト>/api/auth/google/callback`(ローカルは `http://localhost:8787/api/auth/google/callback`)を登録します。

任意: `ALLOWED_EMAILS`(カンマ区切り)を設定すると、そのメールのみログイン可。AI のモデルは `wrangler.jsonc` の `AI_MODEL` で変更可。AI は 1 ユーザー 1 日 60 回まで。

## 開発

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker   # 別端末で npm run dev
```

## テスト

実ブラウザ(Chromium)で操作する E2E と単体テスト。Google は同梱のモックサーバーに差し替えます。

```sh
npm run test:install
npm test
# Playwright のブラウザを取得できない環境: CHROMIUM_PATH=/path/to/chromium npm test
```

Workers AI の実推論と実 Google 認証は、ローカルテストでは検証できません(AI は UI 連携と失敗時の挙動のみ)。
