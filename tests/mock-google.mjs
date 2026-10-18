// テスト専用の Google OAuth モック。
// 本物と同じく「認可コード + PKCE(S256) + client_secret」を検証し、ID トークンを返す。
// 本番コードにテスト用の裏口を入れず、実際のログイン経路をそのままテストするために使う。
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_GOOGLE_PORT || 9099);
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';

const codes = new Map(); // code -> { challenge, redirectUri, identity }
let identity = { email: 'tester@example.com', name: 'Test User', sub: 'sub-tester', mode: 'ok' };

const b64url = (b) => Buffer.from(b).toString('base64url');

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => resolve(data));
  });
}

function makeIdToken(id) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: id.mode === 'bad_iss' ? 'https://evil.example.com' : 'https://accounts.google.com',
    aud: id.mode === 'bad_aud' ? 'someone-else' : CLIENT_ID,
    sub: id.sub,
    email: id.email,
    email_verified: id.mode !== 'unverified',
    name: id.name,
    iat: now,
    exp: id.mode === 'expired' ? now - 60 : now + 3600,
  };
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200).end('ok');
    return;
  }

  // テストから「次にログインするユーザー」を指定する
  if (url.pathname === '/__identity' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    // sub はメールアドレスから決める(別メール = 別人)。明示された場合のみ上書きする
    identity = { name: 'Test User', mode: 'ok', ...body, sub: body.sub ?? `sub-${body.email}` };
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    if (q.get('client_id') !== CLIENT_ID || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
      res.writeHead(400).end('bad authorize request');
      return;
    }
    if (!q.get('state') || !q.get('code_challenge') || !q.get('redirect_uri')) {
      res.writeHead(400).end('missing params');
      return;
    }
    if (identity.mode === 'deny') {
      const back = new URL(q.get('redirect_uri'));
      back.searchParams.set('error', 'access_denied');
      back.searchParams.set('state', q.get('state'));
      res.writeHead(302, { location: back.toString() }).end();
      return;
    }
    const code = randomUUID();
    codes.set(code, { challenge: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), identity: { ...identity } });
    const back = new URL(q.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', identity.mode === 'bad_state' ? 'tampered' : q.get('state'));
    res.writeHead(302, { location: back.toString() }).end();
    return;
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const entry = codes.get(form.get('code'));
    codes.delete(form.get('code')); // コードは 1 回限り
    const reject = (error) => {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error }));
    };
    if (!entry) return reject('invalid_grant');
    if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) return reject('invalid_client');
    if (form.get('grant_type') !== 'authorization_code') return reject('unsupported_grant_type');
    if (form.get('redirect_uri') !== entry.redirectUri) return reject('redirect_uri_mismatch');
    const expected = createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
    if (expected !== entry.challenge) return reject('invalid_grant'); // PKCE
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({ access_token: 'x', token_type: 'Bearer', expires_in: 3600, id_token: makeIdToken(entry.identity) }),
    );
    return;
  }

  res.writeHead(404).end('not found');
});

server.listen(PORT, () => console.log(`mock google listening on :${PORT}`));
