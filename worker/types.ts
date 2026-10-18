export interface Env {
  DB: D1Database;
  AI?: Ai;
  ASSETS: Fetcher;

  // secrets (wrangler secret put)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  AI_MODEL?: string;
  /** カンマ区切り。設定するとそのメールアドレスのみログイン可 */
  ALLOWED_EMAILS?: string;
  /** テスト用: Google の代わりにモックを指す。本番では設定しない */
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export type Vars = { user: SessionUser };
