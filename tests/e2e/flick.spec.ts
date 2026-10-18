import { test, expect } from './fixtures';
import { addMemo, apiStatusOf, apiTasks, cardIn, column, composer, flick, login, timedFlick, trackpadSwipe } from './helpers';

test.describe('フリックでステータス管理', () => {
  test('右へフリックで 未着手 → 進行中 → 完了、左へフリックで戻る。サーバーにも保存される', async ({ page }) => {
    await login(page);
    await addMemo(page, '資料を作る');

    await flick(page, cardIn(page, 'todo', '資料を作る'), 180);
    await expect(cardIn(page, 'doing', '資料を作る')).toHaveCount(1);
    await expect(cardIn(page, 'todo', '資料を作る')).toHaveCount(0);
    await expect.poll(apiStatusOf(page, '資料を作る')).toBe('doing');

    await flick(page, cardIn(page, 'doing', '資料を作る'), 180);
    await expect(cardIn(page, 'done', '資料を作る')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, '資料を作る')).toBe('done');

    await flick(page, cardIn(page, 'done', '資料を作る'), -180);
    await expect(cardIn(page, 'doing', '資料を作る')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, '資料を作る')).toBe('doing');

    await flick(page, cardIn(page, 'doing', '資料を作る'), -180);
    await expect(cardIn(page, 'todo', '資料を作る')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, '資料を作る')).toBe('todo');

    // リロードしても状態は変わらない
    await flick(page, cardIn(page, 'todo', '資料を作る'), 180);
    await expect(cardIn(page, 'doing', '資料を作る')).toHaveCount(1);
    await page.reload();
    await expect(cardIn(page, 'doing', '資料を作る')).toHaveCount(1);
  });

  test('短く弾くだけ(速いが距離は小さい)でも動く / ゆっくり少しだけ動かしても動かない', async ({ page }) => {
    await login(page);
    await addMemo(page, 'ゆっくり');
    await addMemo(page, '素早く');

    // 距離 30px だけゆっくり → 戻る(状態は変わらない)
    const slow = cardIn(page, 'todo', 'ゆっくり').getByTestId('card-body');
    const sb = (await slow.boundingBox())!;
    await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(sb.x + sb.width * 0.3 + 5 * i, sb.y + sb.height / 2);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    await expect(cardIn(page, 'todo', 'ゆっくり')).toHaveCount(1);
    expect(await apiStatusOf(page, 'ゆっくり')()).toBe('todo');

    // 距離 45px でも勢いがあれば進む(60ms で弾く = 約 750px/s)
    await timedFlick(page, cardIn(page, 'todo', '素早く'), 45, 60);
    await expect(cardIn(page, 'doing', '素早く')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, '素早く')).toBe('doing');

    // 同じ 45px でも勢いが無ければ(600ms かけて動かす)動かない
    await timedFlick(page, cardIn(page, 'todo', 'ゆっくり'), 45, 600);
    await page.waitForTimeout(400);
    await expect(cardIn(page, 'todo', 'ゆっくり')).toHaveCount(1);
  });

  test('端では動かない: 未着手を左へ・完了を右へ弾いても元の位置に戻る', async ({ page }) => {
    await login(page);
    await addMemo(page, '端テスト');
    await flick(page, cardIn(page, 'todo', '端テスト'), -200);
    await page.waitForTimeout(500);
    await expect(cardIn(page, 'todo', '端テスト')).toHaveCount(1);

    await flick(page, cardIn(page, 'todo', '端テスト'), 200);
    await flick(page, cardIn(page, 'doing', '端テスト'), 200);
    await expect(cardIn(page, 'done', '端テスト')).toHaveCount(1);
    await flick(page, cardIn(page, 'done', '端テスト'), 200);
    await page.waitForTimeout(500);
    await expect(cardIn(page, 'done', '端テスト')).toHaveCount(1);
    expect(await apiStatusOf(page, '端テスト')()).toBe('done');
  });

  test('ドラッグ中は移動先のヒントが現れる', async ({ page }) => {
    await login(page);
    await addMemo(page, 'ヒント確認');
    const card = cardIn(page, 'todo', 'ヒント確認');
    const box = (await card.getByTestId('card-body').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3 + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x + box.width * 0.3 + 90, box.y + box.height / 2, { steps: 5 });
    const hint = card.locator('.hint-next');
    await expect(hint).toContainText('進行中');
    await expect.poll(async () => Number(await hint.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
    await page.screenshot({ path: 'test-results/drag-hint.png' });
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(cardIn(page, 'todo', 'ヒント確認')).toHaveCount(1);
  });

  test('Mac のトラックパッド: 2本指の横スワイプ(ネイティブ wheel の deltaX)で移動できる', async ({ page }) => {
    await login(page);
    await addMemo(page, 'トラックパッド');
    const box = (await cardIn(page, 'todo', 'トラックパッド').getByTestId('card-body').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    // 指を右へ = deltaX がマイナス(ナチュラルスクロール)。実ブラウザの入力経路でそのまま送る
    await page.mouse.wheel(-220, 0);
    await expect(cardIn(page, 'doing', 'トラックパッド')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, 'トラックパッド')).toBe('doing');

    await page.waitForTimeout(400);
    const box2 = (await cardIn(page, 'doing', 'トラックパッド').getByTestId('card-body').boundingBox())!;
    await page.mouse.move(box2.x + box2.width * 0.4, box2.y + box2.height / 2);
    await page.mouse.wheel(220, 0); // 左へ
    await expect(cardIn(page, 'todo', 'トラックパッド')).toHaveCount(1);
  });

  test('トラックパッド: 実機と同じ間隔の連続スワイプで 1 段だけ進み、慣性の尾で 2 段飛ばない / 途中でやめると元に戻る', async ({ page }) => {
    await login(page);
    await addMemo(page, '慣性');
    await addMemo(page, 'やめる');

    // 12ms 間隔で 40px × 6 回 = 240px 動かし、その後も慣性の尾(20 イベント)が続く
    await trackpadSwipe(cardIn(page, 'todo', '慣性'), -40, 6, 12, 20);
    await expect(cardIn(page, 'doing', '慣性')).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(cardIn(page, 'doing', '慣性')).toHaveCount(1); // 完了まで行っていない
    expect(await apiStatusOf(page, '慣性')()).toBe('doing');

    // 距離が足りないまま指を離す(60px)と元の位置に戻る
    await trackpadSwipe(cardIn(page, 'todo', 'やめる'), -30, 2, 12);
    await page.waitForTimeout(500);
    await expect(cardIn(page, 'todo', 'やめる')).toHaveCount(1);
    // スプリングで元の位置(x=0)へ収束する
    await expect
      .poll(() => cardIn(page, 'todo', 'やめる').getByTestId('card-body').evaluate((el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41)))
      .toBeLessThan(0.5);
  });

  test('縦スクロール(deltaY)ではカードは動かない', async ({ page }) => {
    await login(page);
    await addMemo(page, '縦は動かない');
    const body = cardIn(page, 'todo', '縦は動かない').getByTestId('card-body');
    const box = (await body.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(2, 80);
    await page.waitForTimeout(400);
    await expect(cardIn(page, 'todo', '縦は動かない')).toHaveCount(1);
  });

  test('キーボード: ←/→ で移動(フォーカスが引き継がれる)、Enter で編集、Delete で削除→元に戻す', async ({ page }) => {
    await login(page);
    await addMemo(page, 'キーボード操作');
    await cardIn(page, 'todo', 'キーボード操作').getByTestId('card-body').focus();
    await page.keyboard.press('ArrowRight');
    await expect(cardIn(page, 'doing', 'キーボード操作')).toHaveCount(1);
    await expect(cardIn(page, 'doing', 'キーボード操作').getByTestId('card-body')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cardIn(page, 'done', 'キーボード操作')).toHaveCount(1);
    await page.keyboard.press('ArrowLeft');
    await expect(cardIn(page, 'doing', 'キーボード操作')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, 'キーボード操作')).toBe('doing');

    // 削除 → トーストの「元に戻す」で復元(状態も保持)
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('card')).toHaveCount(0);
    await expect.poll(async () => (await apiTasks(page)).length).toBe(0);
    await page.getByTestId('toast-action').click();
    await expect(cardIn(page, 'doing', 'キーボード操作')).toHaveCount(1);
    await expect.poll(apiStatusOf(page, 'キーボード操作')).toBe('doing');
    await page.reload();
    await expect(cardIn(page, 'doing', 'キーボード操作')).toHaveCount(1);
  });

  test('ホバーのボタン(進める/戻す/削除)でも操作できる', async ({ page }) => {
    await login(page);
    await addMemo(page, 'ボタン操作');
    const card = cardIn(page, 'todo', 'ボタン操作');
    await card.hover();
    await expect(card.getByTestId('tool-prev')).toHaveCount(0); // 未着手には「戻す」は無い
    await card.getByTestId('tool-next').click();
    await expect(cardIn(page, 'doing', 'ボタン操作')).toHaveCount(1);
    await cardIn(page, 'doing', 'ボタン操作').hover();
    await cardIn(page, 'doing', 'ボタン操作').getByTestId('tool-prev').click();
    await expect(cardIn(page, 'todo', 'ボタン操作')).toHaveCount(1);
    await cardIn(page, 'todo', 'ボタン操作').hover();
    await cardIn(page, 'todo', 'ボタン操作').getByTestId('tool-delete').click();
    await expect(page.getByTestId('card')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('削除しました');
  });

  test('ダブルクリックでタイトル編集(Enter 保存 / Esc キャンセル)。日本語変換中の Enter では確定しない', async ({ page }) => {
    await login(page);
    await addMemo(page, '編集前');
    const title = cardIn(page, 'todo', '編集前').getByTestId('card-title');
    await title.dblclick();
    const edit = page.getByTestId('card-edit');
    await expect(edit).toBeFocused();

    // Esc はキャンセル
    await edit.fill('キャンセルされる');
    await edit.press('Escape');
    await expect(cardIn(page, 'todo', '編集前')).toHaveCount(1);

    // IME 変換中の Enter では編集が確定しない
    await cardIn(page, 'todo', '編集前').getByTestId('card-title').dblclick();
    await page.getByTestId('card-edit').fill('編集後');
    await page.getByTestId('card-edit').evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    });
    await expect(page.getByTestId('card-edit')).toBeVisible();

    await page.getByTestId('card-edit').press('Enter');
    await expect(cardIn(page, 'todo', '編集後')).toHaveCount(1);
    await expect.poll(async () => (await apiTasks(page)).map((t) => t.title)).toEqual(['編集後']);
  });

  test('完了カードは取り消し線とチェックが付き、各列の件数が正しく更新される', async ({ page }) => {
    await login(page);
    await addMemo(page, 'A');
    await addMemo(page, 'B');
    await addMemo(page, 'C');
    await expect(column(page, 'todo').getByTestId('count')).toHaveText('3');
    await flick(page, cardIn(page, 'todo', 'A'), 180);
    await flick(page, cardIn(page, 'doing', 'A'), 180);
    await expect(cardIn(page, 'done', 'A')).toHaveCount(1);
    await expect(column(page, 'todo').getByTestId('count')).toHaveText('2');
    await expect(column(page, 'doing').getByTestId('count')).toHaveText('0');
    await expect(column(page, 'done').getByTestId('count')).toHaveText('1');
    const deco = await cardIn(page, 'done', 'A').getByTestId('card-title').evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(deco).toBe('line-through');
    await expect(cardIn(page, 'done', 'A').locator('.status-icon path')).toHaveCount(1);
    await composer(page).focus();
  });
});
