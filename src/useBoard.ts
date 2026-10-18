import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { BoardInfo, MotionHint, Status, Task } from './types';
import type { ToastInput } from './components/Toast';

interface Options {
  toast: (t: ToastInput) => void;
  onUnauthorized: () => void;
}

const AI_ERRORS: Record<string, string> = {
  rate_limited: '本日のAI利用上限に達しました',
  ai_unavailable: 'AIを利用できません',
  ai_failed: 'AIの処理に失敗しました。もう一度お試しください',
  ai_empty: 'AIから有効な結果を得られませんでした',
};

export const BOARD_KEY = 'flick:board';
export const readSavedBoard = (): string | null => {
  try {
    return localStorage.getItem(BOARD_KEY);
  } catch {
    return null;
  }
};
const saveBoard = (id: string) => {
  try {
    localStorage.setItem(BOARD_KEY, id);
  } catch {
    /* ignore */
  }
};

const BOARD_ERRORS: Record<string, string> = {
  invalid_email: 'メールアドレスの形式が正しくありません',
  invalid_name: 'ボード名は1〜40文字で入力してください',
  too_many_members: '参加できるのは20人までです',
  too_many_boards: '作成できるボードは20個までです',
  forbidden: 'この操作はボードの所有者だけができます',
  not_found: 'ボードが見つかりません',
};

const SYNC_MS = 4000;

const sameTasks = (a: Task[], b: Task[]) =>
  a.length === b.length &&
  a.every((t, i) => {
    const o = b[i];
    return t.id === o.id && t.title === o.title && t.status === o.status && t.position === o.position;
  });

/** タスクの状態管理。操作は即座に画面へ反映し(楽観的更新)、保存は裏で行う。 */
export function useBoard({ toast, onUnauthorized }: Options) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hint, setHint] = useState<MotionHint | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [boardId, setBoardIdState] = useState('');
  const [switching, setSwitching] = useState(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const boardsRef = useRef(boards);
  boardsRef.current = boards;

  // 他の人の変更を取り込む定期同期が、手元の操作を巻き戻さないための印。
  // 保存中の操作がある間と、同期リクエストの発行後に操作があった場合は、その同期結果を捨てる。
  const pendingRef = useRef(0);
  const epochRef = useRef(0);
  const syncingRef = useRef(false);
  const track = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    pendingRef.current++;
    epochRef.current++;
    return p.finally(() => {
      pendingRef.current--;
      epochRef.current++;
    });
  }, []);

  const setBoardId = useCallback((id: string) => {
    boardIdRef.current = id;
    setBoardIdState(id);
    saveBoard(id);
  }, []);

  const fail = useCallback(
    (e: unknown, message: string) => {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      toast({ message, tone: 'error' });
    },
    [toast, onUnauthorized],
  );

  const applyRemote = useCallback(
    (r: { boards?: BoardInfo[]; boardId?: string; tasks?: Task[] }, requested: string) => {
      if (r.boards && JSON.stringify(r.boards) !== JSON.stringify(boardsRef.current)) setBoards(r.boards);
      if (r.boardId && r.boardId !== requested) {
        // 自分がメンバーでなくなった(外された・削除された)
        setBoardId(r.boardId);
        toast({ message: 'このボードは利用できなくなりました。マイボードに戻ります', tone: 'error' });
        setTasks(r.tasks ?? []);
        return;
      }
      const next = r.tasks ?? [];
      setTasks((prev) => (sameTasks(prev, next) ? prev : next));
    },
    [setBoardId, toast],
  );

  /** サーバーの最新状態を取り込む(失敗しても黙って次回に任せる) */
  const refresh = useCallback(async () => {
    if (syncingRef.current || !boardIdRef.current) return;
    syncingRef.current = true;
    const id = boardIdRef.current;
    const startEpoch = epochRef.current;
    try {
      const r = await api.bootstrap(id);
      if (!r.user) return onUnauthorized();
      if (pendingRef.current > 0 || epochRef.current !== startEpoch || boardIdRef.current !== id) return;
      applyRemote(r, id);
    } catch {
      /* 一時的な通信失敗は無視 */
    } finally {
      syncingRef.current = false;
    }
  }, [applyRemote, onUnauthorized]);

  const init = useCallback(
    (r: { boards?: BoardInfo[]; boardId?: string; tasks?: Task[] }) => {
      setBoards(r.boards ?? []);
      if (r.boardId) setBoardId(r.boardId);
      setTasks(r.tasks ?? []);
    },
    [setBoardId],
  );

  // 画面が見えている間、数秒おきに同期する。タブに戻ったときは即座に同期する
  useEffect(() => {
    if (!boardId) return;
    const tick = () => document.visibilityState === 'visible' && void refresh();
    const timer = window.setInterval(tick, SYNC_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [boardId, refresh]);

  const switchBoard = useCallback(
    async (id: string) => {
      if (id === boardIdRef.current) return;
      setHint(null);
      setBoardId(id);
      setTasks([]);
      setSwitching(true);
      try {
        const r = await api.bootstrap(id);
        if (!r.user) return onUnauthorized();
        if (boardIdRef.current !== id) return;
        // 切り替え中に追加したメモ(保存前のもの)は残す
        const local = tasksRef.current;
        const fromServer = r.tasks ?? [];
        const ids = new Set(fromServer.map((t) => t.id));
        const merged = [...local.filter((t) => !ids.has(t.id)), ...fromServer].sort((a, b) => b.position - a.position);
        applyRemote({ ...r, tasks: merged }, id);
      } catch (e) {
        fail(e, 'ボードを読み込めませんでした');
      } finally {
        setSwitching(false);
      }
    },
    [applyRemote, fail, onUnauthorized, setBoardId],
  );

  const boardAction = useCallback(
    async <T,>(fn: () => Promise<T>, fallback: string): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          onUnauthorized();
          return null;
        }
        toast({ message: e instanceof ApiError ? (BOARD_ERRORS[e.code] ?? fallback) : fallback, tone: 'error' });
        return null;
      }
    },
    [onUnauthorized, toast],
  );

  const replaceBoard = (b: BoardInfo) => setBoards((p) => p.map((x) => (x.id === b.id ? b : x)));

  const createBoard = useCallback(
    async (name: string) => {
      const b = await boardAction(() => api.createBoard(name), 'ボードを作成できませんでした');
      if (!b) return false;
      setBoards((p) => [...p, b]);
      await switchBoard(b.id);
      return true;
    },
    [boardAction, switchBoard],
  );

  const renameBoard = useCallback(
    async (id: string, name: string) => {
      const b = await boardAction(() => api.renameBoard(id, name), '名前を変更できませんでした');
      if (b) replaceBoard(b);
      return !!b;
    },
    [boardAction],
  );

  const addMember = useCallback(
    async (id: string, email: string) => {
      const b = await boardAction(() => api.addMember(id, email), 'メンバーを追加できませんでした');
      if (b) replaceBoard(b);
      return !!b;
    },
    [boardAction],
  );

  const leaveOrRemove = useCallback(
    async (id: string, email: string, self: boolean) => {
      const ok = await boardAction(() => api.removeMember(id, email).then(() => true), 'メンバーを外せませんでした');
      if (!ok) return false;
      if (self) {
        const personal = boardsRef.current.find((b) => b.isPersonal);
        setBoards((p) => p.filter((b) => b.id !== id));
        if (personal) await switchBoard(personal.id);
        toast({ message: 'ボードから退出しました' });
      } else {
        setBoards((p) => p.map((b) => (b.id === id ? { ...b, members: b.members.filter((m) => m !== email) } : b)));
      }
      return true;
    },
    [boardAction, switchBoard, toast],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      const ok = await boardAction(() => api.deleteBoard(id).then(() => true), 'ボードを削除できませんでした');
      if (!ok) return false;
      const personal = boardsRef.current.find((b) => b.isPersonal);
      setBoards((p) => p.filter((b) => b.id !== id));
      if (personal) await switchBoard(personal.id);
      toast({ message: 'ボードを削除しました' });
      return true;
    },
    [boardAction, switchBoard, toast],
  );

  const create = useCallback(
    (title: string, extra: Partial<Pick<Task, 'status' | 'position' | 'createdAt' | 'id'>> = {}): Task => {
      const now = Date.now();
      const task: Task = {
        id: extra.id ?? crypto.randomUUID(),
        title,
        status: extra.status ?? 'todo',
        position: extra.position ?? now,
        createdAt: extra.createdAt ?? now,
        updatedAt: now,
      };
      setTasks((p) => [task, ...p]);
      track(
        api.createTask({
          id: task.id,
          title,
          status: task.status,
          position: task.position,
          createdAt: task.createdAt,
          boardId: boardIdRef.current,
        }),
      )
        .catch((e) => {
          setTasks((p) => p.filter((t) => t.id !== task.id));
          fail(e, 'メモを保存できませんでした');
        });
      return task;
    },
    [fail, track],
  );

  const add = useCallback(
    (title: string) => {
      const task = create(title);
      setHint({ kind: 'add', id: task.id, dir: 0 });
    },
    [create],
  );

  const move = useCallback(
    (id: string, to: Status, dir: number, via?: MotionHint['via']) => {
      const position = Date.now();
      setHint({ kind: 'move', id, dir, via });
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, status: to, position, updatedAt: position } : t)));
      track(api.updateTask(id, { status: to, position })).catch((e) => {
        fail(e, '状態を保存できませんでした');
        void refresh();
      });
    },
    [fail, refresh, track],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      setHint(null);
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t)));
      track(api.updateTask(id, { title })).catch((e) => {
        fail(e, '変更を保存できませんでした');
        void refresh();
      });
    },
    [fail, refresh, track],
  );

  const remove = useCallback(
    (id: string) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (!target) return;
      setHint({ kind: 'delete', id, dir: 0 });
      setTasks((p) => p.filter((t) => t.id !== id));
      track(api.deleteTask(id)).catch((e) => {
        fail(e, '削除できませんでした');
        void refresh();
      });
      toast({
        message: '削除しました',
        action: {
          label: '元に戻す',
          run: () => {
            setHint({ kind: 'restore', id, dir: 0 });
            create(target.title, {
              id: target.id,
              status: target.status,
              position: target.position,
              createdAt: target.createdAt,
            });
          },
        },
      });
    },
    [create, fail, refresh, toast, track],
  );

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      await fn();
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }, []);

  /** AI: メモを実行しやすいタスク名に整える */
  const refine = useCallback(
    (task: Task) =>
      withBusy(task.id, async () => {
        try {
          const { title } = await api.refine(task.title);
          if (title === task.title) return toast({ message: 'すでに整っています' });
          const before = task.title;
          setHint({ kind: 'ai', id: task.id, dir: 0 });
          rename(task.id, title);
          toast({ message: 'AIで整えました', action: { label: '元に戻す', run: () => rename(task.id, before) } });
        } catch (e) {
          fail(e, e instanceof ApiError ? (AI_ERRORS[e.code] ?? 'AIを利用できません') : 'AIを利用できません');
        }
      }),
    [fail, rename, toast, withBusy],
  );

  /** AI: タスクを実行順のサブタスクに分解して未着手に追加する */
  const breakdown = useCallback(
    (task: Task) =>
      withBusy(task.id, async () => {
        try {
          const { steps } = await api.breakdown(task.title);
          const now = Date.now();
          const created = steps.map((title, i) => create(title, { position: now + (steps.length - i) }));
          setHint({ kind: 'ai', id: created[0]?.id ?? task.id, dir: 0 });
          toast({
            message: `サブタスクを${created.length}件追加しました`,
            action: {
              label: '元に戻す',
              run: () => {
                const ids = new Set(created.map((c) => c.id));
                setTasks((p) => p.filter((t) => !ids.has(t.id)));
                created.forEach((c) => void track(api.deleteTask(c.id)).catch(() => undefined));
              },
            },
          });
        } catch (e) {
          fail(e, e instanceof ApiError ? (AI_ERRORS[e.code] ?? 'AIを利用できません') : 'AIを利用できません');
        }
      }),
    [create, fail, toast, track, withBusy],
  );

  return {
    tasks,
    hint,
    busy,
    boards,
    boardId,
    switching,
    init,
    add,
    move,
    rename,
    remove,
    refine,
    breakdown,
    refresh,
    switchBoard,
    createBoard,
    renameBoard,
    addMember,
    removeMember: leaveOrRemove,
    deleteBoard,
  };
}
