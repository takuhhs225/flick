import { Hono } from 'hono';
import type { Env, SessionUser, Vars } from './types';
import { requireUser } from './auth';
import { isUuid } from './util';

const MAX_NAME = 40;
const MAX_MEMBERS = 20;
const MAX_OWNED_BOARDS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BoardDto {
  id: string;
  name: string;
  ownerEmail: string;
  isOwner: boolean;
  isPersonal: boolean;
  members: string[];
}

export async function isMember(db: D1Database, boardId: string, email: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM board_members WHERE board_id = ?1 AND email = ?2')
    .bind(boardId, email.toLowerCase())
    .first();
  return !!row;
}

export async function listBoards(db: D1Database, user: SessionUser): Promise<BoardDto[]> {
  const email = user.email.toLowerCase();
  const { results: boards } = await db
    .prepare(
      `SELECT b.id, b.name, b.owner_id, b.created_at, o.email AS owner_email
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.email = ?1
       JOIN users o ON o.id = b.owner_id
       ORDER BY (b.id = ?2) DESC, b.created_at ASC`,
    )
    .bind(email, user.id)
    .all<{ id: string; name: string; owner_id: string; owner_email: string }>();
  if (boards.length === 0) return [];

  const { results: members } = await db
    .prepare(
      `SELECT board_id, email FROM board_members
       WHERE board_id IN (SELECT board_id FROM board_members WHERE email = ?1)
       ORDER BY added_at ASC, email ASC`,
    )
    .bind(email)
    .all<{ board_id: string; email: string }>();
  const byBoard = new Map<string, string[]>();
  for (const m of members) byBoard.set(m.board_id, [...(byBoard.get(m.board_id) ?? []), m.email]);

  return boards.map((b) => ({
    id: b.id,
    name: b.name,
    ownerEmail: b.owner_email.toLowerCase(),
    isOwner: b.owner_id === user.id,
    isPersonal: b.id === b.owner_id,
    members: byBoard.get(b.id) ?? [],
  }));
}

function parseName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= MAX_NAME ? n : null;
}

export const boards = new Hono<{ Bindings: Env; Variables: Vars }>();
boards.use('*', requireUser);

boards.get('/', async (c) => c.json({ boards: await listBoards(c.env.DB, c.get('user')) }));

boards.post('/', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = parseName(body?.name);
  if (!name) return c.json({ error: 'invalid_name' }, 400);

  const owned = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM boards WHERE owner_id = ?1')
    .bind(user.id)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_OWNED_BOARDS) return c.json({ error: 'too_many_boards' }, 409);

  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO boards (id, name, owner_id, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, name, user.id, now),
    c.env.DB.prepare('INSERT INTO board_members (board_id, email, added_at) VALUES (?1, ?2, ?3)').bind(
      id,
      user.email.toLowerCase(),
      now,
    ),
  ]);
  const created = (await listBoards(c.env.DB, user)).find((b) => b.id === id);
  return c.json({ board: created }, 201);
});

/** 対象ボードを読み、呼び出したユーザーがメンバーか・所有者かを返す */
async function load(c: { env: Env; get: (k: 'user') => SessionUser }, id: string) {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, owner_id FROM boards WHERE id = ?1').bind(id).first<{ id: string; owner_id: string }>();
  if (!row) return null;
  if (!(await isMember(c.env.DB, id, user.email))) return null; // 非メンバーには存在自体を隠す
  return { id: row.id, isOwner: row.owner_id === user.id, isPersonal: row.id === row.owner_id, user };
}

boards.patch('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  const b = await load(c, id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if (!b.isOwner) return c.json({ error: 'forbidden' }, 403);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = parseName(body?.name);
  if (!name) return c.json({ error: 'invalid_name' }, 400);
  await c.env.DB.prepare('UPDATE boards SET name = ?1 WHERE id = ?2').bind(name, id).run();
  return c.json({ board: (await listBoards(c.env.DB, b.user)).find((x) => x.id === id) });
});

boards.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  const b = await load(c, id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if (!b.isOwner) return c.json({ error: 'forbidden' }, 403);
  if (b.isPersonal) return c.json({ error: 'personal_board' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tasks WHERE board_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM board_members WHERE board_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM boards WHERE id = ?1').bind(id),
  ]);
  return c.body(null, 204);
});

boards.post('/:id/members', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  const b = await load(c, id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if (!b.isOwner) return c.json({ error: 'forbidden' }, 403);
  if (b.isPersonal) return c.json({ error: 'personal_board' }, 409);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return c.json({ error: 'invalid_email' }, 400);

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM board_members WHERE board_id = ?1').bind(id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MEMBERS) return c.json({ error: 'too_many_members' }, 409);

  await c.env.DB.prepare('INSERT OR IGNORE INTO board_members (board_id, email, added_at) VALUES (?1, ?2, ?3)')
    .bind(id, email, Date.now())
    .run();
  return c.json({ board: (await listBoards(c.env.DB, b.user)).find((x) => x.id === id) }, 201);
});

/** 所有者はメンバーを外せる。メンバー本人は自分だけ外せる(退出)。所有者は外れられない */
boards.delete('/:id/members/:email', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'invalid_id' }, 400);
  const b = await load(c, id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const target = decodeURIComponent(c.req.param('email')).trim().toLowerCase();
  const self = b.user.email.toLowerCase();
  if (!b.isOwner && target !== self) return c.json({ error: 'forbidden' }, 403);
  if (b.isOwner && target === self) return c.json({ error: 'owner_cannot_leave' }, 409);
  await c.env.DB.prepare('DELETE FROM board_members WHERE board_id = ?1 AND email = ?2').bind(id, target).run();
  return c.body(null, 204);
});
