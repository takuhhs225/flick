import { test, expect } from './fixtures';
import { addMemo, cardIn, composer, login } from './helpers';

const tools = (card: import('@playwright/test').Locator) => card.locator('.card-tools');

test.describe('スマホ/タッチでの使い勝手', () => {
  test('入力欄の右の ⏎ ボタンを押してもメモが追加され、キーボード(フォーカス)は外れない', async ({ page }) => {
    await login(page);
    await composer(page).fill('ボタンで追加');
    await page.getByTestId('composer-submit').click();
    await expect(cardIn(page, 'todo', 'ボタンで追加')).toHaveCount(1);
    await expect(composer(page)).toHaveValue('');
    await expect(composer(page)).toBeFocused();
    // 空のときは何も起きない
    await page.getByTestId('composer-submit').click();
    await expect(page.getByTestId('card')).toHaveCount(1);
  });

  test('カードをタップすると操作ボタンが出て、別のカードをタップすると前のカードのボタン(とAIメニュー)は閉じる', async ({ page }) => {
    await login(page);
    await addMemo(page, 'A');
    await addMemo(page, 'B');
    const a = cardIn(page, 'todo', 'A');
    const b = cardIn(page, 'todo', 'B');

    await a.getByTestId('card-body').click();
    await expect(tools(a)).toHaveCSS('opacity', '1');
    await a.getByTestId('tool-ai').click();
    await expect(a.getByRole('menu')).toBeVisible();

    await b.getByTestId('card-body').click();
    await expect(tools(b)).toHaveCSS('opacity', '1');
    await expect(tools(a)).toHaveCSS('opacity', '0');
    await expect(a.getByRole('menu')).toHaveCount(0);

    // カード以外(余白)をタップすると、どのカードのボタンも消える
    await page.mouse.click(4, 4);
    await expect(tools(b)).toHaveCSS('opacity', '0');
  });

  test('実際のタッチ操作(tap)でも同じ: 触れたカードだけに操作ボタンが出る', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page);
    await addMemo(page, 'タップA');
    await addMemo(page, 'タップB');
    const a = cardIn(page, 'todo', 'タップA');
    const b = cardIn(page, 'todo', 'タップB');
    await a.getByTestId('card-body').tap();
    await expect(tools(a)).toHaveCSS('opacity', '1');
    await b.getByTestId('card-body').tap();
    await expect(tools(b)).toHaveCSS('opacity', '1');
    await expect(tools(a)).toHaveCSS('opacity', '0');
    await ctx.close();
  });

  test('ガラスの光沢は文字の後ろ(文字が白く霞まない)', async ({ page }) => {
    await login(page);
    await addMemo(page, 'くっきり読める');
    const body = cardIn(page, 'todo', 'くっきり読める').getByTestId('card-body');
    await body.hover();
    const info = await body.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      const title = getComputedStyle(el.querySelector('[data-testid=card-title]')!);
      return { z: before.zIndex, iso: getComputedStyle(el).isolation, color: title.color };
    });
    expect(info.z).toBe('-1');
    expect(info.iso).toBe('isolate');
    expect(info.color).toBe('rgb(23, 26, 33)');
  });
});

test.describe('ホーム画面に追加', () => {
  test('アイコンとマニフェストが配信され、HTML から参照されている', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/apple-touch-icon.png');
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
    for (const [path, size] of [
      ['/apple-touch-icon.png', 180],
      ['/icon-192.png', 192],
      ['/icon-512.png', 512],
    ] as const) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('image/png');
      const buf = await res.body();
      // PNG ヘッダー(幅・高さ)を読んで、指定どおりの大きさか確認する
      expect(buf.readUInt32BE(16), `${path} width`).toBe(size);
      expect(buf.readUInt32BE(20), `${path} height`).toBe(size);
    }
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.name).toBe('Flick');
    expect(m.display).toBe('standalone');
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toContain('512x512');
  });
});
