import { Hono } from 'hono';
import type { Env, Vars } from './types';
import { requireUser } from './auth';
import { isUuid } from './util';

const STATUSES = ['todo', 'doing', 'done'] as const;
type Status = (typeof STATUSES)[number];
const MAX_TITLE = 500;
const MAX_TASKS_PER_USER = 2000;

interface Row {
  id: string;
  title: string;
  status: Status;
  position: number;
  created_at: number;
  updated_at: number;
}

const toDto = (r: Row) => ({
  id: r.id,
  title: r.title,
  status: r.status,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

function parseTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= MAX_TITLE ? t : null;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const tasks = new Hono<{ Bindings: Env; Variables: Vars }>();
tasks.use('*', requireUser);

export async function listTasks(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      'SELECT id, title, status, position, created_at, updated_at FROM tasks WHERE user_id = ?1 ORDER BY position DESC LIMIT 2000',
    )
    .bind(userId)
    .all<Row>();
  return results.map(toDto);
}

tasks.get('/', async (c) => c.json({ tasks: await listTasks(c.env.DB, c.get('user').id) }));

/** 作成 (クライアント生成 UUID。同じ ID の再送・削除の取り消しは上書きとして冪等に扱う) */
tasks.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'invalid_json' }, 400);

  const title = parseTitle(body.title);
  if (!title) return c.json({ error: 'invalid_title' }, 400);
  const status = body.status === undefined ? 'todo' : body.status;
  if (!isStatus(status)) return c.json({ error: 'invalid_status' }, 400);
  if (body.id !== undefined && !isUuid(body.id)) return c.json({ error: 'invalid_id' }, 400);
  if (body.position !== undefined && !isFiniteNum(body.position)) return c.json({ error: 'invalid_position' }, 400);

  const userId = c.get('user').id;
  const id = (body.id as string | undefined) ?? crypto.randomUUID();
  const now = Date.now();
  const position = (body.position as number | undefined) ?? now;
  const createdAt = isFiniteNum(body.createdAt) && body.createdAt > 0 && body.createdAt <= now ? body.createdAt : now;

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?1')
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TASKS_PER_USER) return c.json({ error: 'too_many_tasks' }, 409);

  await c.env.DB.prepare(
    `INSERT INTO tasks (id, user_id, title, status, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status,
       position = excluded.position, updated_at = excluded.updated_at
     WHERE tasks.user_id = excluded.user_id`,
  )
    .bind(id, userId, title, status, position, createdAt, now)
    .run();

  const row = await c.env.DB.prepare(
    'SELECT id, title, status, position, created_at, updated_at FROM tasks WHERE id = ?1 AND user_id = ?2',
  )
    .bind(id, userId)
    .first<Row>();
  // 他ユーザーの ID と衝突した場合は行が見えない
  if (!row) return c.json({ error: 'conflict' }, 409);
  return c.json({ task: toDto(row) }, 201);
});

tasks.patch('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'invalid_json' }, 400);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.title !== undefined) {
    const t = parseTitle(body.title);
    if (!t) return c.json({ error: 'invalid_title' }, 400);
    sets.push(`title = ?${binds.push(t)}`);
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return c.json({ error: 'invalid_status' }, 400);
    sets.push(`status = ?${binds.push(body.status)}`);
  }
  if (body.position !== undefined) {
    if (!isFiniteNum(body.position)) return c.json({ error: 'invalid_position' }, 400);
    sets.push(`position = ?${binds.push(body.position)}`);
  }
  if (sets.length === 0) return c.json({ error: 'empty_patch' }, 400);

  sets.push(`updated_at = ?${binds.push(Date.now())}`);
  const idIdx = binds.push(id);
  const userIdx = binds.push(c.get('user').id);

  const row = await c.env.DB.prepare(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?${idIdx} AND user_id = ?${userIdx}
     RETURNING id, title, status, position, created_at, updated_at`,
  )
    .bind(...binds)
    .first<Row>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ task: toDto(row) });
});

tasks.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?1 AND user_id = ?2').bind(id, c.get('user').id).run();
  return c.body(null, 204);
});
