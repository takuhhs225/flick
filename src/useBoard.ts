import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { MotionHint, Status, Task } from './types';
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

/** タスクの状態管理。操作は即座に画面へ反映し(楽観的更新)、保存は裏で行う。 */
export function useBoard({ toast, onUnauthorized }: Options) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hint, setHint] = useState<MotionHint | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const fail = useCallback(
    (e: unknown, message: string) => {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      toast({ message, tone: 'error' });
    },
    [toast, onUnauthorized],
  );

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.tasks());
    } catch (e) {
      fail(e, '同期に失敗しました');
    }
  }, [fail]);

  const init = useCallback((list: Task[]) => setTasks(list), []);

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
      api
        .createTask({ id: task.id, title, status: task.status, position: task.position, createdAt: task.createdAt })
        .catch((e) => {
          setTasks((p) => p.filter((t) => t.id !== task.id));
          fail(e, 'メモを保存できませんでした');
        });
      return task;
    },
    [fail],
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
      api.updateTask(id, { status: to, position }).catch((e) => {
        fail(e, '状態を保存できませんでした');
        void refresh();
      });
    },
    [fail, refresh],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      setHint(null);
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t)));
      api.updateTask(id, { title }).catch((e) => {
        fail(e, '変更を保存できませんでした');
        void refresh();
      });
    },
    [fail, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (!target) return;
      setHint({ kind: 'delete', id, dir: 0 });
      setTasks((p) => p.filter((t) => t.id !== id));
      api.deleteTask(id).catch((e) => {
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
    [create, fail, refresh, toast],
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
                created.forEach((c) => void api.deleteTask(c.id).catch(() => undefined));
              },
            },
          });
        } catch (e) {
          fail(e, e instanceof ApiError ? (AI_ERRORS[e.code] ?? 'AIを利用できません') : 'AIを利用できません');
        }
      }),
    [create, fail, toast, withBusy],
  );

  return { tasks, hint, busy, init, add, move, rename, remove, refine, breakdown, refresh };
}
