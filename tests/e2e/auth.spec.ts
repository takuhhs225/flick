import { test, expect } from './fixtures';
import { addMemo, apiTasks, login, setIdentity, uniqueEmail } from './helpers';

test.describe('ログイン (Google 認証のみ)', () => {
  test('未ログインはログイン画面のみ。キャッチコピーなし・ログイン手段は Google だけ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('login')).toBeVisible();
    await expect(page.getByTestId('login-button')).toHaveText('Googleでログイン');
    // 画面上の文字は「Flick」と「Googleでログイン」だけ(余計な文言なし)
    const text = (await page.getByTestId('login').innerText()).replace(/\s+/g, ' ').trim();
    expect(text).toBe('Flick Googleでログイン');
    // パスワード/メール入力欄は存在しない
    await expect(page.locator('input')).toHaveCount(0);
    await expect(page.getByTestId('login-button')).toHaveAttribute('href', '/api/auth/google');
  });

  test('Google でログイン → ボード表示 → アバターメニューにメールアドレス', async ({ page }) => {
    const email = await login(page, uniqueEmail(), '山田 花子');
    await page.getByTestId('avatar').click();
    await expect(page.getByTestId('menu-user')).toContainText('山田 花子');
    await expect(page.getByTestId('menu-user')).toContainText(email);
    // 画像が無い場合は頭文字のフォールバック
    await expect(page.getByTestId('avatar')).toContainText('山');
  });

  test('セッションが維持される(リロードしてもログイン済み)。Cookie は HttpOnly', async ({ page, context }) => {
    await login(page);
    await page.reload();
    await expect(page.getByTestId('app')).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === 'flick_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    // JS からはセッション Cookie を読めない
    expect(await page.evaluate(() => document.cookie)).not.toContain('flick_session');
  });

  test('ログアウトするとログイン画面へ戻り、APIも 401 になる', async ({ page }) => {
    await login(page);
    await page.getByTestId('avatar').click();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login')).toBeVisible();
    expect((await page.request.get('/api/me')).status()).toBe(401);
    await page.reload();
    await expect(page.getByTestId('login')).toBeVisible();
  });

  test('ユーザーが認可画面でキャンセルした場合はエラー通知を出してログイン画面に留まる', async ({ page }) => {
    await setIdentity({ email: uniqueEmail(), mode: 'deny' });
    await page.goto('/');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('login')).toBeVisible();
    await expect(page.getByTestId('toast')).toContainText('キャンセル');
    expect(page.url()).not.toContain('auth_error'); // URL からエラーパラメータは消える
  });

  for (const [mode, label] of [
    ['bad_aud', '別クライアント宛ての ID トークン'],
    ['bad_iss', '発行者が Google ではないトークン'],
    ['expired', '期限切れトークン'],
    ['unverified', 'メール未確認アカウント'],
    ['bad_state', 'state が改ざんされたコールバック (CSRF)'],
  ] as const) {
    test(`不正なログインは拒否される: ${label}`, async ({ page }) => {
      await setIdentity({ email: uniqueEmail(), mode });
      await page.goto('/');
      await page.getByTestId('login-button').click();
      await expect(page.getByTestId('login')).toBeVisible();
      await expect(page.getByTestId('toast')).toBeVisible();
      expect((await page.request.get('/api/me')).status()).toBe(401);
    });
  }
});

test.describe('API の認可と分離', () => {
  test('未ログインのAPIは 401', async ({ request }) => {
    for (const path of ['/api/me', '/api/tasks']) expect((await request.get(path)).status()).toBe(401);
    expect((await request.post('/api/tasks', { data: { title: 'x' } })).status()).toBe(401);
    expect((await request.post('/api/ai/refine', { data: { text: 'x' } })).status()).toBe(401);
    // bootstrap は未ログインでも 200 (user: null)
    const b = await request.get('/api/bootstrap');
    expect(b.status()).toBe(200);
    expect((await b.json()).user).toBeNull();
  });

  test('別オリジンからの書き込みは CSRF として拒否される', async ({ page }) => {
    await login(page);
    const res = await page.request.post('/api/tasks', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { title: 'csrf' },
    });
    expect(res.status()).toBe(403);
    expect((await apiTasks(page)).some((t) => t.title === 'csrf')).toBe(false);
  });

  test('他のユーザーのタスクは見えず、変更も削除もできない', async ({ page, browser }) => {
    await login(page);
    await addMemo(page, 'Aさんだけのメモ');
    const taskId = (await apiTasks(page)).find((t) => t.title === 'Aさんだけのメモ')!.id;

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB);
    // B の一覧に A のタスクは出ない
    await expect(pageB.getByTestId('card')).toHaveCount(0);
    expect(await apiTasks(pageB)).toHaveLength(0);
    // B が A の ID を直接叩いても変更・削除できない
    const patch = await pageB.request.patch(`/api/tasks/${taskId}`, { data: { title: '乗っ取り' } });
    expect(patch.status()).toBe(404);
    await pageB.request.delete(`/api/tasks/${taskId}`);
    // 同じ ID での作成(上書き)も拒否される
    const hijack = await pageB.request.post('/api/tasks', { data: { id: taskId, title: '乗っ取り' } });
    expect(hijack.status()).toBe(409);
    // A のデータは無傷
    const mine = await apiTasks(page);
    expect(mine.find((t) => t.id === taskId)?.title).toBe('Aさんだけのメモ');
    await ctxB.close();
  });
});
