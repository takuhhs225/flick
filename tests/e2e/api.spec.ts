import { test, expect } from './fixtures';
import { apiTasks, login } from './helpers';

test.describe('タスク API', () => {
  test('入力検証: タイトル・ステータス・ID・位置', async ({ page }) => {
    await login(page);
    const post = (data: unknown) => page.request.post('/api/tasks', { data });
    expect((await post({ title: '' })).status()).toBe(400);
    expect((await post({ title: '   ' })).status()).toBe(400);
    expect((await post({ title: 'あ'.repeat(501) })).status()).toBe(400);
    expect((await post({ title: 'ok' + 'あ'.repeat(498) })).status()).toBe(201); // ちょうど 500 文字
    expect((await post({ title: 'x', status: 'archived' })).status()).toBe(400);
    expect((await post({ title: 'x', id: 'not-a-uuid' })).status()).toBe(400);
    expect((await post({ title: 'x', position: 'abc' })).status()).toBe(400);
    expect((await post({ title: 123 })).status()).toBe(400);
    expect((await page.request.post('/api/tasks', { data: 'not json', headers: { 'content-type': 'application/json' } })).status()).toBe(400);
  });

  test('作成は冪等(同じ ID の再送で重複しない)。PATCH の検証と 404', async ({ page }) => {
    await login(page);
    const id = crypto.randomUUID();
    const body = { id, title: '冪等', position: 100 };
    expect((await page.request.post('/api/tasks', { data: body })).status()).toBe(201);
    expect((await page.request.post('/api/tasks', { data: body })).status()).toBe(201);
    expect((await apiTasks(page)).filter((t) => t.id === id)).toHaveLength(1);

    const patch = (data: unknown, target = id) => page.request.patch(`/api/tasks/${target}`, { data });
    expect((await patch({})).status()).toBe(400);
    expect((await patch({ status: 'nope' })).status()).toBe(400);
    expect((await patch({ title: '' })).status()).toBe(400);
    expect((await patch({ title: '更新後', status: 'done' })).status()).toBe(200);
    expect((await patch({ title: 'x' }, crypto.randomUUID())).status()).toBe(404);
    expect((await patch({ title: 'x' }, 'bad-id')).status()).toBe(400);
    const t = (await apiTasks(page)).find((x) => x.id === id)!;
    expect(t.title).toBe('更新後');
    expect(t.status).toBe('done');

    // 削除も冪等
    expect((await page.request.delete(`/api/tasks/${id}`)).status()).toBe(204);
    expect((await page.request.delete(`/api/tasks/${id}`)).status()).toBe(204);
    expect((await apiTasks(page)).some((x) => x.id === id)).toBe(false);
  });

  test('一覧は position の降順(新しい順)で返る', async ({ page }) => {
    await login(page);
    for (const [i, title] of ['a', 'b', 'c'].entries()) {
      await page.request.post('/api/tasks', { data: { title, position: 1000 + i } });
    }
    expect((await apiTasks(page)).map((t) => t.title)).toEqual(['c', 'b', 'a']);
  });
});
