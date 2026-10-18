-- 共有ボード: ボード単位でタスクを持ち、メンバー(メールアドレス)で共有する

CREATE TABLE boards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_boards_owner ON boards(owner_id);

-- メンバーはメールアドレス(小文字)で管理する。まだログインしていない人も招待できる。
-- 所有者も 1 行持つ(権限判定を「メンバーか」だけで済ませるため)
CREATE TABLE board_members (
  board_id  TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (board_id, email)
);
CREATE INDEX idx_board_members_email ON board_members(email);

ALTER TABLE tasks ADD COLUMN board_id TEXT REFERENCES boards(id) ON DELETE CASCADE;

-- 既存ユーザーごとに「個人ボード」(id = ユーザー ID)を作り、既存タスクを移す
INSERT INTO boards (id, name, owner_id, created_at)
  SELECT id, 'マイボード', id, created_at FROM users;
INSERT INTO board_members (board_id, email, added_at)
  SELECT id, lower(email), created_at FROM users;
UPDATE tasks SET board_id = user_id;

CREATE INDEX idx_tasks_board ON tasks(board_id, status, position DESC);
