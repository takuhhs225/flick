import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, SessionUser, Vars } from './types';
import { b64url, decodeJwtPayload, randomToken, safeEqual, sha256, sha256Hex } from './util';

const SESSION_COOKIE = 'flick_session';
const TX_COOKIE = 'flick_oauth';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

const isHttps = (url: string) => new URL(url).protocol === 'https:';

const fail = (code: string) => `/?auth_error=${encodeURIComponent(code)}`;

/** ステップ1: Google の認可画面へ (PKCE + state) */
auth.get('/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId || !c.env.GOOGLE_CLIENT_SECRET) return c.redirect(fail('not_configured'));

  const url = new URL(c.req.url);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = b64url(await sha256(verifier));

  setCookie(c, TX_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/api/auth',
    maxAge: 600,
  });

  const authUrl = new URL(c.env.GOOGLE_AUTH_URL || GOOGLE_AUTH_URL);
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return c.redirect(authUrl.toString());
});

/** ステップ2: コード交換 → ID トークン検証 → セッション発行 */
auth.get('/google/callback', async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const tx = getCookie(c, TX_COOKIE);
  deleteCookie(c, TX_COOKIE, { path: '/api/auth' });

  if (url.searchParams.get('error')) return c.redirect(fail('denied'));
  if (!code || !state || !tx) return c.redirect(fail('invalid_request'));

  const [txState, verifier] = tx.split('.');
  if (!txState || !verifier || !safeEqual(txState, state)) return c.redirect(fail('invalid_state'));

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.redirect(fail('not_configured'));

  let tokenRes: Response;
  try {
    tokenRes = await fetch(c.env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
  } catch {
    return c.redirect(fail('token_exchange'));
  }
  if (!tokenRes.ok) return c.redirect(fail('token_exchange'));

  const tokens = (await tokenRes.json().catch(() => null)) as { id_token?: string } | null;
  // ID トークンは Google のトークンエンドポイントから TLS 経由で直接受け取っているため、
  // OIDC Core 3.1.3.7 に従い署名検証は省略し、クレーム(iss/aud/exp/email_verified)のみ検証する。
  const claims = tokens?.id_token ? decodeJwtPayload(tokens.id_token) : null;
  if (!claims) return c.redirect(fail('invalid_token'));

  const now = Math.floor(Date.now() / 1000);
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = claims.aud === clientId;
  const expOk = typeof claims.exp === 'number' && claims.exp > now;
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!issOk || !audOk || !expOk || !sub || !email) return c.redirect(fail('invalid_token'));
  if (claims.email_verified !== true) return c.redirect(fail('email_unverified'));

  const allowed = (c.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(email)) return c.redirect(fail('not_allowed'));

  const name = typeof claims.name === 'string' ? claims.name.slice(0, 200) : null;
  const picture = typeof claims.picture === 'string' && claims.picture.startsWith('https://') ? claims.picture : null;
  const nowMs = Date.now();

  const row = await c.env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture
     RETURNING id`,
  )
    .bind(crypto.randomUUID(), sub, email, name, picture, nowMs)
    .first<{ id: string }>();
  if (!row) return c.redirect(fail('internal'));

  const token = randomToken(32);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(nowMs),
    c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)').bind(
      await sha256Hex(token),
      row.id,
      nowMs + SESSION_TTL_SEC * 1000,
      nowMs,
    ),
  ]);

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
  return c.redirect('/');
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

/** Cookie のセッションからユーザーを引く。無効・期限切れなら null */
export async function getSessionUser(c: AppContext): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<SessionUser>();
  if (!user) deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return user;
}

export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};
