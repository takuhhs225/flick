import type { SessionUser } from './types';

/** 個人ボード(id = ユーザー ID)を、なければ作る。ログイン時と起動時に呼ぶ(冪等) */
export async function ensurePersonalBoard(db: D1Database, user: SessionUser) {
  const now = Date.now();
  await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO boards (id, name, owner_id, created_at) VALUES (?1, 'マイボード', ?1, ?2)")
      .bind(user.id, now),
    db
      .prepare('INSERT OR IGNORE INTO board_members (board_id, email, added_at) VALUES (?1, ?2, ?3)')
      .bind(user.id, user.email.toLowerCase(), now),
  ]);
}
