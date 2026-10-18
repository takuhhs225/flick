import { Hono } from 'hono';
import type { Env, Vars } from './types';
import { auth, getSessionUser, requireUser } from './auth';
import { listTasks, tasks } from './tasks';
import { ai } from './ai';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', async (c, next) => {
  // CSRF 対策: 状態を変える操作は同一オリジンからのみ受け付ける
  // (ブラウザは非 GET に必ず Origin を付けるため、Origin がある場合だけ検証すれば足りる)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'bad_origin' }, 403);
  }
  await next();
  c.header('Cache-Control', 'no-store');
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', auth);
app.get('/api/me', requireUser, (c) => c.json({ user: c.get('user') }));
// 起動時に 1 往復で「ログイン状態 + タスク」を返す。未ログインでも 200 (user: null) にして、
// ブラウザのコンソールに 401 エラーを出さない。
app.get('/api/bootstrap', async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user, tasks: await listTasks(c.env.DB, user.id) });
});
app.route('/api/tasks', tasks);
app.route('/api/ai', ai);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
