# 技術選定の理由

## 全体
| 要件 | 選定 | 理由 |
|---|---|---|
| バックエンド基盤 | Cloudflare Workers + Static Assets | 「面倒なものは Cloudflare に」の方針に合致。サーバー管理・証明書・CDN・スケールが不要で、静的配信と API を 1 つのデプロイにまとめられる。`run_worker_first: ["/api/*"]` で API だけ Worker を通し、静的ファイルは直接配信して速い。 |
| DB | D1 (SQLite) | タスクは単純なリレーショナルデータで、ユーザー単位の整合性と並び替え・索引が欲しい。Workers と同一ネットワークで追加サービス不要、無料枠が広い。KV は一貫性が弱く、Durable Objects は本用途には過剰。 |
| AI | Workers AI(`@cf/google/gemma-4-26b-a4b-it`、`AI_MODEL` で差し替え可) | 要件指定。バインディングだけで使え、APIキー管理が不要。日本語の短文整形・分解に十分な汎用モデルを選び、モデル名は設定に出して交換可能にした。応答形式の差(`response` / OpenAI 互換 `choices`)は両対応。 |
| 認証 | Google OAuth(認可コード + PKCE + state)を自前実装 | 要件が Google のみ。外部認証ライブラリはユーザー管理や多プロバイダ前提で過大で、Workers との相性差もある。数十行で済み、挙動を完全に把握できる。ID トークンは token エンドポイントから TLS で直接受け取るため、OIDC Core 3.1.3.7 に従い署名検証なしで iss/aud/exp/email_verified を検証。 |
| セッション | D1 に SHA-256 ハッシュで保存、Cookie は HttpOnly + SameSite=Lax(https では Secure) | DB が漏れてもセッションを悪用できず、即時失効できる。JWT セッションは失効が難しいため不採用。CSRF は非 GET の Origin 検査で防御。 |
| API フレームワーク | Hono | Workers 向けに作られた軽量ルーター(依存が小さく型が付く)。素の fetch ハンドラよりミドルウェア(Origin 検査等)が書きやすい。 |

## フロントエンド
| 項目 | 選定 | 理由 |
|---|---|---|
| UI | React 19 | useSyncExternalStore 等で「スケルトン→本画面」をまたいで入力中の文字を保持でき、状態管理が素直。 |
| ビルド | Vite + TypeScript | 高速な開発サーバーと Workers Static Assets 向けの静的出力。型でフロントと API の境界を守る。 |
| アニメーション | motion | ドラッグ、レイアウトアニメーション、AnimatePresence(カードの列間移動・消去)が宣言的に書け、「ふんだんなアニメーション」を要件どおり実現しやすい。 |
| Liquid Glass | 素の CSS(backdrop-filter、縁のハイライト、ポインタ追従の光沢) | 追加ライブラリ不要。白ベースで、常時動く背景は描画負荷が高く(アイドル 8.7fps まで低下)、グラデーション+ポインタ視差のみに変更して 58fps を確保。カード単体の backdrop-filter も外した。 |
| フリック | Pointer イベント + 手計算の速度(event.timeStamp)+ wheel の deltaX + キーボード | ライブラリの速度推定はフレーム単位に量子化され、短く速いフリックを取りこぼした。トラックパッド(Mac 優先)は wheel deltaX で拾い、慣性を無視するロックを入れた。キーボードでも操作可能。 |

## 「開いた瞬間にメモ」のための設計
- 入力欄は常にオートフォーカス。どこかをクリックした後でも、文字を打てば入力欄に入る
- index.html に静的スケルトンを入れ、JS 読み込み前から表示
- localStorage のヒントでログイン済みなら、スケルトン中でも本物の入力欄を表示し、Enter は保留して読み込み完了後に追加
- `/api/bootstrap` でユーザーとタスクを 1 リクエストで取得(未ログインも 200 で返し、コンソールに 401 を出さない)
- 楽観的更新 + 元に戻す。ID はクライアント生成 UUID で冪等アップサート
- 日本語 IME の確定 Enter では送信しない(isComposing、keyCode 229、確定直後 80ms)

## テスト
- Playwright(実 Chromium)で E2E。`wrangler dev --local` の実 Worker + ローカル D1 を使用
- Google はモックサーバー(コード・PKCE・クライアントシークレットを検証、aud/iss/期限/未検証メール/state 不一致/拒否を再現)
- コンソールのエラー・警告は全テストで失敗扱い
- CI(GitHub Actions)で同じものを実行
