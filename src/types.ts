export type Status = 'todo' | 'doing' | 'done';

export const STATUSES: readonly Status[] = ['todo', 'doing', 'done'];

export const STATUS_LABEL: Record<Status, string> = {
  todo: '未着手',
  doing: '進行中',
  done: '完了',
};

export interface Task {
  id: string;
  title: string;
  status: Status;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** カードのアニメーション方向などを、状態変更と同時にビューへ伝えるヒント */
export interface MotionHint {
  kind: 'add' | 'move' | 'delete' | 'ai' | 'restore';
  id: string;
  /** move 時: 右へ進める = 1 / 左へ戻す = -1 */
  dir: number;
  via?: 'key' | 'pointer' | 'wheel';
}

export interface BoardInfo {
  id: string;
  name: string;
  ownerEmail: string;
  isOwner: boolean;
  /** 個人ボード(自分専用。共有・削除はできない) */
  isPersonal: boolean;
  /** メンバーのメールアドレス(所有者を含む) */
  members: string[];
}

export interface Bootstrap {
  user: User | null;
  boards?: BoardInfo[];
  boardId?: string;
  tasks?: Task[];
}
