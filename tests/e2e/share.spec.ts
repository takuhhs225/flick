import { test, expect } from './fixtures';
import {
  addMemo,
  boardIdOf,
  boardName,
  cardIn,
  column,
  createBoard,
  flick,
  inviteMember,
  login,
  loginAs,
  openBoardMenu,
  openShare,
  switchBoard,
  uniqueEmail,
} from './helpers';

const SYNC = { timeout: 12_000 };

test.describe('共有ボード', () => {
  test('最初は自分専用の「マイボード」。共有はできず、案内が出る', async ({ page }) => {
    await login(page);
    await expect(boardName(page)).toHaveText('マイボード');
    await openShare(page);
    await expect(page.getByTestId('personal-note')).toBeVisible();
    await expect(page.getByTestId('member-email')).toHaveCount(0);
    const me = await page.request.get('/api/bootstrap');
    const id = ((await me.json()) as { boardId: string }).boardId;
    const res = await page.request.post(`/api/boards/${id}/members`, { data: { email: 'x@example.com' } });
    expect(res.status()).toBe(409);
    expect((await page.request.delete(`/api/boards/${id}`)).status()).toBe(409);
  });

  test('ボードを作って相手を招待 → 相手が初めてログインしても、そのボードが見えて同じタスクを操作できる', async ({ page, browser }) => {
    const a = await login(page, uniqueEmail(), '作成者');
    await addMemo(page, '個人のメモ');
    await createBoard(page, '家族');
    // 新しいボードは空で、個人ボードのメモは混ざらない
    await expect(page.getByTestId('card')).toHaveCount(0);
    await addMemo(page, '牛乳を買う');

    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail); // 相手はまだ一度もログインしていない

    const b = await loginAs(browser, bEmail);
    await expect(boardName(b.page)).toHaveText('マイボード');
    await openBoardMenu(b.page);
    await expect(b.page.getByTestId('board-option').filter({ hasText: '家族' })).toContainText('2人');
    await b.page.getByTestId('board-option').filter({ hasText: '家族' }).click();
    await expect(boardName(b.page)).toHaveText('家族');
    await expect(cardIn(b.page, 'todo', '牛乳を買う')).toHaveCount(1);
    await expect(b.page.getByTestId('card')).toHaveCount(1); // 作成者の個人メモは見えない

    // 相手がフリックして進める → 作成者の画面にも(再読み込みなしで)反映される
    await flick(b.page, cardIn(b.page, 'todo', '牛乳を買う'), 220);
    await expect(cardIn(b.page, 'doing', '牛乳を買う')).toHaveCount(1);
    await expect(cardIn(page, 'doing', '牛乳を買う')).toHaveCount(1, SYNC);

    // 作成者が追加 → 相手に出る / 相手が追加 → 作成者に出る
    await addMemo(page, '卵を買う');
    await expect(cardIn(b.page, 'todo', '卵を買う')).toHaveCount(1, SYNC);
    await addMemo(b.page, '洗剤を買う');
    await expect(cardIn(page, 'todo', '洗剤を買う')).toHaveCount(1, SYNC);

    // 削除も共有される
    const card = cardIn(page, 'todo', '卵を買う');
    await card.hover();
    await card.getByTestId('tool-delete').click();
    await expect(cardIn(b.page, 'todo', '卵を買う')).toHaveCount(0, SYNC);

    // 個人ボードは、相手からも作成者のメモが見えないまま
    await switchBoard(b.page, 'マイボード');
    await expect(b.page.getByTestId('card')).toHaveCount(0);
    expect(a).toBeTruthy();
    expect(b.problems).toEqual([]);
    await b.ctx.close();
  });

  test('選んだボードは再読み込みしても保たれる', async ({ page }) => {
    await login(page);
    await createBoard(page, 'チーム');
    await addMemo(page, '会議の準備');
    await page.reload();
    await expect(boardName(page)).toHaveText('チーム');
    await expect(cardIn(page, 'todo', '会議の準備')).toHaveCount(1);
    await switchBoard(page, 'マイボード');
    await page.reload();
    await expect(boardName(page)).toHaveText('マイボード');
  });

  test('メンバーでない人からは存在しないのと同じ(閲覧・追加・更新・削除すべて 404)', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '秘密');
    await addMemo(page, '見せない');
    const id = await boardIdOf(page, '秘密');
    const taskId = ((await (await page.request.get(`/api/tasks?board=${id}`)).json()) as { tasks: { id: string }[] }).tasks[0].id;

    const c = await loginAs(browser, uniqueEmail(), '部外者');
    const req = c.page.request;
    expect((await req.get(`/api/tasks?board=${id}`)).status()).toBe(404);
    expect(
      (await req.post('/api/tasks', { data: { id: crypto.randomUUID(), title: '侵入', boardId: id } })).status(),
    ).toBe(404);
    expect((await req.patch(`/api/tasks/${taskId}`, { data: { title: '改ざん' } })).status()).toBe(404);
    await req.delete(`/api/tasks/${taskId}`);
    expect((await req.patch(`/api/boards/${id}`, { data: { name: '乗っ取り' } })).status()).toBe(404);
    expect((await req.post(`/api/boards/${id}/members`, { data: { email: 'me@example.com' } })).status()).toBe(404);
    expect((await req.delete(`/api/boards/${id}`)).status()).toBe(404);
    const boards = ((await (await req.get('/api/boards')).json()) as { boards: { name: string }[] }).boards;
    expect(boards.map((x) => x.name)).toEqual(['マイボード']);
    // 他人のボードを指定して開こうとすると、マイボードに戻る
    const boot = (await (await req.get(`/api/bootstrap?board=${id}`)).json()) as { boardId: string };
    expect(boot.boardId).not.toBe(id);

    // 被害がないこと(タスクはそのまま)
    const still = ((await (await page.request.get(`/api/tasks?board=${id}`)).json()) as { tasks: { title: string }[] }).tasks;
    expect(still.map((t) => t.title)).toEqual(['見せない']);
    await c.ctx.close();
  });

  test('メンバーは招待・名前変更・削除ができない(所有者のみ)が、タスクは操作できる', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '権限');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const id = await boardIdOf(page, '権限');

    const b = await loginAs(browser, bEmail);
    const req = b.page.request;
    expect((await req.post(`/api/boards/${id}/members`, { data: { email: 'z@example.com' } })).status()).toBe(403);
    expect((await req.patch(`/api/boards/${id}`, { data: { name: '改名' } })).status()).toBe(403);
    expect((await req.delete(`/api/boards/${id}`)).status()).toBe(403);
    // 他のメンバーを外すことも、所有者を外すこともできない
    expect((await req.delete(`/api/boards/${id}/members/${encodeURIComponent(uniqueEmail())}`)).status()).toBe(403);
    // UI でも、メンバーには招待欄と削除が出ない。退出は出る
    await switchBoard(b.page, '権限');
    await openShare(b.page);
    await expect(b.page.getByTestId('member-email')).toHaveCount(0);
    await expect(b.page.getByTestId('board-delete')).toHaveCount(0);
    await expect(b.page.getByTestId('member-remove')).toHaveCount(0);
    await expect(b.page.getByTestId('board-leave')).toBeVisible();
    await b.page.getByTestId('share-close').click();
    await addMemo(b.page, 'メンバーが追加');
    await expect(cardIn(page, 'todo', 'メンバーが追加')).toHaveCount(1, SYNC);
    await b.ctx.close();
  });

  test('所有者がメンバーを外す → 相手は自動でマイボードに戻り、もうアクセスできない', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '外す');
    await addMemo(page, '共有メモ');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const id = await boardIdOf(page, '外す');

    const b = await loginAs(browser, bEmail);
    await switchBoard(b.page, '外す');
    await expect(cardIn(b.page, 'todo', '共有メモ')).toHaveCount(1);

    await openShare(page);
    await page.getByTestId('member-row').filter({ hasText: bEmail }).getByTestId('member-remove').click();
    await expect(page.getByTestId('member-row')).toHaveCount(1);
    await page.getByTestId('share-close').click();

    await expect(boardName(b.page)).toHaveText('マイボード', SYNC);
    await expect(b.page.getByTestId('toast').last()).toContainText('利用できなくなりました');
    expect((await b.page.request.get(`/api/tasks?board=${id}`)).status()).toBe(404);
    await b.ctx.close();
  });

  test('メンバーが自分で退出できる。所有者は退出できない', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '退出');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const id = await boardIdOf(page, '退出');

    const b = await loginAs(browser, bEmail);
    await switchBoard(b.page, '退出');
    await openShare(b.page);
    await b.page.getByTestId('board-leave').click();
    await expect(boardName(b.page)).toHaveText('マイボード');
    await expect(b.page.getByTestId('share-panel')).toHaveCount(0);
    await openBoardMenu(b.page);
    await expect(b.page.getByTestId('board-option')).toHaveCount(1);
    await b.page.keyboard.press('Escape');

    // 所有者側のメンバー一覧から消えている / 所有者は API でも退出不可
    await expect.poll(async () => {
      const r = (await (await page.request.get('/api/boards')).json()) as { boards: { id: string; members: string[] }[] };
      return r.boards.find((x) => x.id === id)!.members.length;
    }).toBe(1);
    const self = ((await (await page.request.get('/api/me')).json()) as { user: { email: string } }).user.email;
    expect((await page.request.delete(`/api/boards/${id}/members/${encodeURIComponent(self)}`)).status()).toBe(409);
    await b.ctx.close();
  });

  test('所有者がボードを削除(2回押して確定)すると、中のタスクも消え、メンバーはマイボードに戻る', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '消す');
    await addMemo(page, '消えるメモ');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const id = await boardIdOf(page, '消す');

    const b = await loginAs(browser, bEmail);
    await switchBoard(b.page, '消す');
    await expect(cardIn(b.page, 'todo', '消えるメモ')).toHaveCount(1);

    await openShare(page);
    await page.getByTestId('board-delete').click(); // 1回目はまだ消えない
    await expect(page.getByTestId('board-delete')).toContainText('もう一度');
    expect((await page.request.get(`/api/tasks?board=${id}`)).status()).toBe(200);
    await page.getByTestId('board-delete').click();
    await expect(boardName(page)).toHaveText('マイボード');
    await expect(page.getByTestId('share-panel')).toHaveCount(0);

    expect((await page.request.get(`/api/tasks?board=${id}`)).status()).toBe(404);
    await expect(boardName(b.page)).toHaveText('マイボード', SYNC);
    await b.ctx.close();
  });

  test('招待のメールが不正だとエラー通知。同じ人を二重に追加しても増えない', async ({ page }) => {
    await login(page);
    await createBoard(page, '検証');
    await openShare(page);
    await page.getByTestId('member-email').fill('abc@');
    // ブラウザの形式検証をすり抜ける値を API に直接送ってもはじく
    const id = await boardIdOf(page, '検証');
    expect((await page.request.post(`/api/boards/${id}/members`, { data: { email: 'abc@' } })).status()).toBe(400);
    expect((await page.request.post(`/api/boards/${id}/members`, { data: { email: 123 } })).status()).toBe(400);

    const dup = uniqueEmail();
    await page.getByTestId('member-email').fill(dup);
    await page.getByTestId('member-add').click();
    await expect(page.getByTestId('member-row')).toHaveCount(2);
    await page.getByTestId('member-email').fill(dup.toUpperCase());
    await page.getByTestId('member-add').click();
    await expect.poll(async () => page.getByTestId('member-row').count()).toBe(2); // 大文字小文字は同一視
  });

  test('ボード名の変更は共有メンバーにも反映される', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '旧名');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const b = await loginAs(browser, bEmail);
    await switchBoard(b.page, '旧名');

    await openShare(page);
    await page.getByTestId('board-rename').fill('新名');
    await page.getByTestId('board-rename').press('Enter');
    await page.getByTestId('share-close').click();
    await expect(boardName(page)).toHaveText('新名');
    await expect(boardName(b.page)).toHaveText('新名', SYNC);
    await b.ctx.close();
  });

  test('ボード名・人数の入力検証(空・長すぎ・作成数の上限)', async ({ page }) => {
    await login(page);
    expect((await page.request.post('/api/boards', { data: { name: '' } })).status()).toBe(400);
    expect((await page.request.post('/api/boards', { data: { name: 'あ'.repeat(41) } })).status()).toBe(400);
    expect((await page.request.post('/api/boards', { data: {} })).status()).toBe(400);
    // 所有できるボードは 20 個まで(マイボードを含む)
    for (let i = 0; i < 19; i++) expect((await page.request.post('/api/boards', { data: { name: `b${i}` } })).status()).toBe(201);
    expect((await page.request.post('/api/boards', { data: { name: '溢れる' } })).status()).toBe(409);
  });

  test('同期は手元の操作を巻き戻さない(保存中・直後の操作が優先される)', async ({ page, browser }) => {
    await login(page);
    await createBoard(page, '競合');
    const bEmail = uniqueEmail();
    await inviteMember(page, bEmail);
    const b = await loginAs(browser, bEmail);
    await switchBoard(b.page, '競合');

    // 相手の画面で連続追加している間に、作成者側の同期が走っても全件残る
    for (let i = 1; i <= 6; i++) await addMemo(b.page, `連打${i}`);
    await expect(column(b.page, 'todo').getByTestId('card')).toHaveCount(6);
    await expect(column(page, 'todo').getByTestId('card')).toHaveCount(6, SYNC);
    await page.waitForTimeout(5000); // さらに同期が数回走っても変わらない
    await expect(column(b.page, 'todo').getByTestId('card')).toHaveCount(6);
    await expect(column(page, 'todo').getByTestId('card')).toHaveCount(6);
    await b.ctx.close();
  });
});
