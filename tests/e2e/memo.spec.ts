import { test, expect } from './fixtures';
import { addMemo, apiTasks, cardIn, column, composer, login } from './helpers';

test.describe('開いた瞬間にメモできる', () => {
  test('ログイン直後・リロード後とも、クリックせずに入力欄にフォーカスが当たっている', async ({ page }) => {
    await login(page);
    await expect(composer(page)).toBeFocused();
    await page.reload();
    await expect(composer(page)).toBeVisible();
    await expect(composer(page)).toBeFocused();
    // そのまま打ち始められる
    await page.keyboard.type('開いてすぐ打つ');
    await expect(composer(page)).toHaveValue('開いてすぐ打つ');
  });

  test('Enter で即座に未着手の先頭へ追加され、入力欄は空に戻りフォーカスが残る。リロード後も残る', async ({ page }) => {
    await login(page);
    await addMemo(page, '牛乳を買う');
    await expect(composer(page)).toHaveValue('');
    await expect(composer(page)).toBeFocused();
    await addMemo(page, '請求書を送る');
    // 新しいものが先頭
    const titles = await column(page, 'todo').getByTestId('card-title').allInnerTexts();
    expect(titles).toEqual(['請求書を送る', '牛乳を買う']);
    await expect(column(page, 'todo').getByTestId('count')).toHaveText('2');

    await page.reload();
    await expect(cardIn(page, 'todo', '牛乳を買う')).toHaveCount(1);
    expect(await column(page, 'todo').getByTestId('card-title').allInnerTexts()).toEqual(['請求書を送る', '牛乳を買う']);
  });

  test('空・空白のみの Enter は無視され、前後の空白は取り除かれる', async ({ page }) => {
    await login(page);
    await composer(page).press('Enter');
    await composer(page).fill('    ');
    await composer(page).press('Enter');
    await expect(page.getByTestId('card')).toHaveCount(0);
    await composer(page).fill('   余白あり   メモ  ');
    await composer(page).press('Enter');
    await expect(page.getByTestId('card-title')).toHaveText('余白あり メモ');
  });

  test('どこをクリックした後でも、文字を打てば入力欄に入る', async ({ page }) => {
    await login(page);
    await page.mouse.click(5, 5); // 余白をクリックしてフォーカスを外す
    await expect(composer(page)).not.toBeFocused();
    await page.keyboard.type('x');
    await expect(composer(page)).toBeFocused();
    await expect(composer(page)).toHaveValue('x');
  });

  test('日本語変換の確定 Enter ではメモが送信されない(IME)', async ({ page }) => {
    await login(page);
    await composer(page).focus();
    const cdp = await page.context().newCDPSession(page);
    // 変換中(未確定)
    await cdp.send('Input.imeSetComposition', { selectionStart: 3, selectionEnd: 3, text: 'かんじ' });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('card')).toHaveCount(0);
    // 変換を確定(これも Enter 相当の操作) → まだ送信されない
    await cdp.send('Input.insertText', { text: '漢字' });
    await expect(composer(page)).toHaveValue('漢字');
    await expect(page.getByTestId('card')).toHaveCount(0);
    // 確定後の Enter で初めて送信される
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await expect(cardIn(page, 'todo', '漢字')).toHaveCount(1);
  });

  test('IME 変換中を示すキーイベント(isComposing / keyCode 229)も送信しない', async ({ page }) => {
    await login(page);
    await composer(page).fill('変換中');
    await composer(page).evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(150);
    await expect(page.getByTestId('card')).toHaveCount(0);
    await composer(page).press('Enter');
    await expect(cardIn(page, 'todo', '変換中')).toHaveCount(1);
  });
});

test.describe('全画面スケルトンローディング', () => {
  test('読み込み中は画面全体がスケルトン。その間もメモを打てて、読み込み完了後に自動で追加される', async ({ page }) => {
    await login(page);
    await addMemo(page, '既存のメモ');

    // 読み込みを 1.5 秒遅らせてスケルトン状態を観察する
    await page.route('**/api/bootstrap*', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.reload();

    const skeleton = page.getByTestId('skeleton');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    // 全画面: ヘッダー・入力欄・3 列ボードすべてがスケルトンで、実データはまだ無い
    await expect(skeleton.locator('.column')).toHaveCount(3);
    expect(await skeleton.locator('.sk').count()).toBeGreaterThan(15);
    await expect(page.getByTestId('card')).toHaveCount(0);
    const box = (await skeleton.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.width).toBeGreaterThanOrEqual(1200); // コンテンツ幅(max 1240px)いっぱい
    expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);

    // 入力欄は本物で、すでにフォーカスされており、スケルトン中でも打てる
    await expect(composer(page)).toBeFocused();
    await page.keyboard.type('スケルトン中に打ったメモ');
    await page.keyboard.press('Enter');
    await expect(composer(page)).toHaveValue('スケルトン中に打ったメモ'); // まだ保留中

    // 読み込み完了 → スケルトンが消え、既存メモが表示され、保留していたメモが追加される
    await expect(page.getByTestId('app')).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    await expect(cardIn(page, 'todo', '既存のメモ')).toHaveCount(1);
    await expect(cardIn(page, 'todo', 'スケルトン中に打ったメモ')).toHaveCount(1);
    await expect(composer(page)).toHaveValue('');
    await expect.poll(async () => (await apiTasks(page)).map((t) => t.title)).toContain('スケルトン中に打ったメモ');
  });

  test('スケルトンは JS の読み込み前(静的 HTML)から表示される', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await expect(page.locator('.column')).toHaveCount(3);
    await ctx.close();
  });
});
