# Flick

開いた瞬間にメモが取れて、フリックでステータスを動かすタスク管理(Web、Mac 優先)。

- メモ: 開くと入力欄にフォーカス済み。Enter で未着手の先頭に追加。読み込み中に打った文字も失われない
- ステータス: カードを左右にフリック(トラックパッドの2本指スワイプ、矢印キー対応)。未着手 ⇄ 進行中 ⇄ 完了
- AI(Workers AI): タスク名を整える / サブタスクに分解
- 共有: ボードを作ってメールアドレスで招待すると、同じタスクを複数人で操作できる(数秒おきに自動で同期)
- ログイン: Google のみ

構成: Cloudflare Workers(Static Assets + Hono)/ D1 / Workers AI、フロントは React + Vite + motion。選定理由は [DESIGN.md](DESIGN.md)。

## セットアップ

```sh
npm install
npx wrangler d1 create flick          # 出力された database_id を wrangler.jsonc に貼る
npm run db:migrate:remote   # 機能追加後も、更新のたびにこれを実行(未適用の分だけ適用される)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

Google Cloud Console で OAuth クライアント(ウェブアプリ)を作り、承認済みリダイレクト URI に
`https://<デプロイ先ホスト>/api/auth/google/callback`(ローカルは `http://localhost:8787/api/auth/google/callback`)を登録します。

任意: `ALLOWED_EMAILS`(カンマ区切り)を設定すると、そのメールのみログイン可。AI のモデルは `wrangler.jsonc` の `AI_MODEL` で変更可。AI は 1 ユーザー 1 日 60 回まで。

## 共有ボード

- 最初は自分専用の「マイボード」。ヘッダーのボード名から新しいボードを作り、人型アイコンでメンバーを招待します。
- 招待はメールアドレス(Google アカウント)で行い、相手がまだ一度もログインしていなくても可能です。`ALLOWED_EMAILS` を設定している場合は、招待する相手もそこに含めてください。
- 権限は「所有者」と「メンバー」の2種類。メンバーはタスクの追加・移動・編集・削除ができ、所有者はさらに名前変更・メンバー管理・ボード削除ができます。メンバーは自分で退出できます。
- 1ボード 20 人、1人が所有できるボードは 20 個まで。

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
