import type { BoardInfo, Bootstrap, Status, Task, User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) {
    let code = 'error';
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const api = {
  bootstrap: (boardId?: string | null) =>
    req<Bootstrap>(boardId ? `/api/bootstrap?board=${encodeURIComponent(boardId)}` : '/api/bootstrap'),
  me: () => req<{ user: User }>('/api/me').then((r) => r.user),
  createTask: (t: Pick<Task, 'id' | 'title' | 'position' | 'createdAt'> & { status?: Status; boardId: string }) =>
    req<{ task: Task }>('/api/tasks', { method: 'POST', ...json(t) }).then((r) => r.task),
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'status' | 'position'>>) =>
    req<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', ...json(patch) }).then((r) => r.task),
  deleteTask: (id: string) => req<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  createBoard: (name: string) => req<{ board: BoardInfo }>('/api/boards', { method: 'POST', ...json({ name }) }).then((r) => r.board),
  renameBoard: (id: string, name: string) =>
    req<{ board: BoardInfo }>(`/api/boards/${id}`, { method: 'PATCH', ...json({ name }) }).then((r) => r.board),
  deleteBoard: (id: string) => req<void>(`/api/boards/${id}`, { method: 'DELETE' }),
  addMember: (id: string, email: string) =>
    req<{ board: BoardInfo }>(`/api/boards/${id}/members`, { method: 'POST', ...json({ email }) }).then((r) => r.board),
  removeMember: (id: string, email: string) =>
    req<void>(`/api/boards/${id}/members/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  refine: (text: string) => req<{ title: string }>('/api/ai/refine', { method: 'POST', ...json({ text }) }),
  breakdown: (text: string) => req<{ steps: string[] }>('/api/ai/breakdown', { method: 'POST', ...json({ text }) }),
  logout: () => req<void>('/api/auth/logout', { method: 'POST' }),
};
