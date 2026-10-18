import { test, expect } from './fixtures';
import { addMemo, cardIn, column, composer, flick, login } from './helpers';

test.describe('デザイン(Liquid Glass・白ベース)とアニメーション', () => {
  test('白ベースの背景 + ガラス表現(backdrop-filter)が実際に適用されている', async ({ page }) => {
    await login(page);
    await addMemo(page, 'ガラスの確認');
    const styles = await page.evaluate(() => {
      const css = (sel: string) => {
        const el = document.querySelector(sel)!;
        const s = getComputedStyle(el);
        return { backdrop: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter, radius: s.borderRadius };
      };
      return {
        body: getComputedStyle(document.body).backgroundColor,
        bg: getComputedStyle(document.querySelector('.bg')!).backgroundImage,
        composer: css('.composer'),
        column: css('.column'),
        card: css('.card'),
      };
    });
    expect(styles.body).toBe('rgb(255, 255, 255)');
    expect(styles.bg).toContain('rgb(255, 255, 255)'); // 背景グラデーションの起点は白
    // 入力欄と列は実際に背後をぼかす(Liquid Glass)。カードは列の内側なので不透明寄りのフロスト
    for (const part of [styles.composer, styles.column]) {
      expect(part.backdrop).toContain('blur(');
      expect(part.backdrop).toContain('saturate(');
    }
    expect(styles.card.backdrop).toBe('none');
    await page.screenshot({ path: 'test-results/board-desktop.png' });
  });

  test('追加したカードは「出現アニメーション」で入ってくる(不透明度が 0→1 に遷移)', async ({ page }) => {
    await login(page);
    const sampler = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          const start = performance.now();
          const tick = () => {
            const el = document.querySelector('[data-testid=card]');
            if (el) out.push(parseFloat(getComputedStyle(el).opacity));
            if (performance.now() - start < 700) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    await composer(page).fill('アニメーション確認');
    await composer(page).press('Enter');
    const samples = await sampler;
    expect(samples.length).toBeGreaterThan(5);
    expect(Math.min(...samples)).toBeLessThan(0.9); // 途中の値がある = 瞬間表示ではない
    expect(samples[samples.length - 1]).toBeCloseTo(1, 1);
  });

  test('フリック直後のカードは列を移動する間、スライドして消える/現れる(一瞬で入れ替わらない)', async ({ page }) => {
    await login(page);
    await addMemo(page, '移動アニメ');
    const seen: number[] = [];
    const sampler = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          const start = performance.now();
          const tick = () => {
            const el = document.querySelector('[data-testid=column-doing] [data-testid=card]');
            if (el) out.push(parseFloat(getComputedStyle(el).opacity));
            if (performance.now() - start < 3000) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    await flick(page, cardIn(page, 'todo', '移動アニメ'), 180);
    seen.push(...(await sampler));
    expect(seen.length).toBeGreaterThan(3);
    expect(Math.min(...seen)).toBeLessThan(0.95);
    await expect(cardIn(page, 'doing', '移動アニメ')).toHaveCount(1);
  });

  test('prefers-reduced-motion でも機能は変わらず動く', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page);
    await addMemo(page, '低モーション');
    await flick(page, cardIn(page, 'todo', '低モーション'), 180);
    await expect(cardIn(page, 'doing', '低モーション')).toHaveCount(1);
    await ctx.close();
  });
});

test.describe('レスポンシブ (狭い画面)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('タブ表示になり、フリックで移動、件数バッジが更新される', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('tabs')).toBeVisible();
    await addMemo(page, 'スマホ幅');
    await expect(page.getByTestId('tab-todo')).toContainText('1');
    await flick(page, cardIn(page, 'todo', 'スマホ幅'), 200);
    await expect(page.getByTestId('tab-todo')).toContainText('0');
    await expect(page.getByTestId('tab-doing')).toContainText('1');
    await page.getByTestId('tab-doing').click();
    await expect(page.getByTestId('tab-doing')).toHaveAttribute('aria-selected', 'true');
    await expect(cardIn(page, 'doing', 'スマホ幅')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/board-mobile.png' });
    // 横スクロールが発生していない
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('スケルトンも狭い画面用(1列 + タブ)で全画面表示される', async ({ page }) => {
    await login(page);
    await page.route('**/api/bootstrap', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue();
    });
    await page.reload();
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await expect(page.locator('.sk-tabs')).toBeVisible();
    await expect(page.locator('[data-testid=skeleton] .column:visible')).toHaveCount(1);
    await expect(page.getByTestId('app')).toBeVisible();
  });
});

test.describe('セキュリティヘッダーと配信', () => {
  test('CSP などのヘッダーが付き、CSP 違反なく動作する', async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), e.violatedDirective + ' ' + e.blockedURI];
      });
    });
    const res = await page.goto('/');
    const h = res!.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    await login(page);
    await addMemo(page, 'CSP確認');
    await flick(page, cardIn(page, 'todo', 'CSP確認'), 180);
    await expect(cardIn(page, 'doing', 'CSP確認')).toHaveCount(1);
    violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp)) ?? []));
    expect(violations).toEqual([]);
    // API はキャッシュされない
    const api = await page.request.get('/api/tasks');
    expect(api.headers()['cache-control']).toBe('no-store');
  });

  test('SPA: 存在しないパスでもアプリが返る / 存在しない API は JSON の 404', async ({ page, request }) => {
    const res = await page.goto('/some/deep/path');
    expect(res!.status()).toBe(200);
    await expect(page.getByTestId('login')).toBeVisible();
    const api = await request.get('/api/nope');
    expect(api.status()).toBe(404);
    expect(await api.json()).toEqual({ error: 'not_found' });
  });

  test('ログイン済みの全画面を通しで操作してもコンソールに警告・エラーが出ない', async ({ page }) => {
    await login(page);
    for (const t of ['一', '二', '三']) await addMemo(page, t);
    await flick(page, cardIn(page, 'todo', '一'), 180);
    await flick(page, cardIn(page, 'todo', '二'), 180);
    await flick(page, cardIn(page, 'doing', '二'), 180);
    await page.getByTestId('avatar').click();
    await page.keyboard.press('Escape');
    await expect(column(page, 'done').getByTestId('card')).toHaveCount(1);
  });
});
