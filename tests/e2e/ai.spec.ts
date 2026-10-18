import { test, expect } from './fixtures';
import { addMemo, apiTasks, cardIn, column, login } from './helpers';

async function openAiMenu(page: import('@playwright/test').Page, text: string, status: 'todo' | 'doing' | 'done' = 'todo') {
  const card = cardIn(page, status, text);
  await card.hover();
  await card.getByTestId('tool-ai').click();
}

test.describe('AI 機能 (Workers AI) — UI と連携部分', () => {
  // ここでは Workers AI の応答をブラウザ側でスタブして、UI の挙動を検証する
  test('「タスク名を整える」: タイトルが置き換わり、「元に戻す」で復元できる。サーバーにも保存', async ({ page }) => {
    await login(page);
    await addMemo(page, 'えーっと牛乳とか買わなきゃ');
    await page.route('**/api/ai/refine', (route) => route.fulfill({ json: { title: '牛乳を買う' } }));

    await openAiMenu(page, 'えーっと牛乳とか買わなきゃ');
    await page.getByTestId('ai-refine').click();
    await expect(cardIn(page, 'todo', '牛乳を買う')).toHaveCount(1);
    await expect(page.getByTestId('toast')).toContainText('AIで整えました');
    await expect.poll(async () => (await apiTasks(page)).map((t) => t.title)).toEqual(['牛乳を買う']);

    await page.getByTestId('toast-action').click();
    await expect(cardIn(page, 'todo', 'えーっと牛乳とか買わなきゃ')).toHaveCount(1);
    await expect.poll(async () => (await apiTasks(page)).map((t) => t.title)).toEqual(['えーっと牛乳とか買わなきゃ']);
  });

  test('「サブタスクに分解」: 未着手に順番どおり追加され、「元に戻す」でまとめて消える', async ({ page }) => {
    await login(page);
    await addMemo(page, '引っ越し準備');
    await page.route('**/api/ai/breakdown', (route) =>
      route.fulfill({ json: { steps: ['業者を比較する', '荷造りを始める', '転出届を出す'] } }),
    );

    await openAiMenu(page, '引っ越し準備');
    await page.getByTestId('ai-breakdown').click();
    await expect(column(page, 'todo').getByTestId('card')).toHaveCount(4);
    // 追加順(実行順)が上から並ぶ
    const titles = await column(page, 'todo').getByTestId('card-title').allInnerTexts();
    expect(titles.slice(0, 3)).toEqual(['業者を比較する', '荷造りを始める', '転出届を出す']);
    await expect.poll(async () => (await apiTasks(page)).length).toBe(4);

    await page.getByTestId('toast-action').click();
    await expect(column(page, 'todo').getByTestId('card')).toHaveCount(1);
    await expect.poll(async () => (await apiTasks(page)).length).toBe(1);
  });

  test('AI 処理中はカードに処理中の表示が出て、AI ボタンは押せない', async ({ page }) => {
    await login(page);
    await addMemo(page, '処理中の見た目');
    await page.route('**/api/ai/refine', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ json: { title: '処理中の見た目を確認する' } });
    });
    await openAiMenu(page, '処理中の見た目');
    await page.getByTestId('ai-refine').click();
    const body = cardIn(page, 'todo', '処理中の見た目').getByTestId('card-body');
    await expect(body).toHaveClass(/is-busy/);
    await expect(cardIn(page, 'todo', '処理中の見た目').getByTestId('tool-ai')).toBeDisabled();
    await expect(cardIn(page, 'todo', '処理中の見た目を確認する')).toHaveCount(1);
    await expect(body).not.toHaveClass(/is-busy/);
  });

});

test.describe('AI の失敗時の UI', () => {
  test.use({ consoleAllow: [/status of 429/] });

  test('上限(429)やAI障害のときは、エラー通知を出してデータは変えない', async ({ page }) => {
    await login(page);
    await addMemo(page, '失敗しても壊れない');
    await page.route('**/api/ai/refine', (route) => route.fulfill({ status: 429, json: { error: 'rate_limited' } }));
    await openAiMenu(page, '失敗しても壊れない');
    await page.getByTestId('ai-refine').click();
    await expect(page.getByTestId('toast').last()).toContainText('上限');
    await expect(cardIn(page, 'todo', '失敗しても壊れない')).toHaveCount(1);
  });
});

test.describe('AI API (Worker 実体)', () => {
  // ローカル検証環境には Workers AI の実体が無いため、実推論は行われない。
  // ここでは「入力検証・認可・失敗時に落ちない」ことを実際の Worker で確認する。
  test.use({ consoleAllow: [/status of (502|503)/] });

  test('入力検証: 空・長すぎるテキストは 400', async ({ page }) => {
    await login(page);
    for (const path of ['/api/ai/refine', '/api/ai/breakdown']) {
      expect((await page.request.post(path, { data: { text: '' } })).status()).toBe(400);
      expect((await page.request.post(path, { data: { text: 'あ'.repeat(501) } })).status()).toBe(400);
      expect((await page.request.post(path, { data: {} })).status()).toBe(400);
    }
  });

  test('AI が使えない環境でも 5xx(500)にならず、UI は「AIを利用できません」系の通知を出す', async ({ page }) => {
    await login(page);
    await addMemo(page, '実Workerで失敗させる');
    const res = await page.request.post('/api/ai/refine', { data: { text: 'テスト' } });
    expect([502, 503]).toContain(res.status());
    expect(['ai_failed', 'ai_unavailable']).toContain((await res.json()).error);

    await openAiMenu(page, '実Workerで失敗させる');
    await page.getByTestId('ai-refine').click();
    await expect(page.getByTestId('toast').last()).toContainText('AI');
    await expect(cardIn(page, 'todo', '実Workerで失敗させる')).toHaveCount(1);
  });
});
