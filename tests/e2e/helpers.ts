import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export const MOCK = 'http://localhost:9099';
let seq = 0;
export const uniqueEmail = () => `user${Date.now()}_${seq++}@example.com`;

/** モック Google が次に返すユーザー(と異常系モード)を指定する */
export async function setIdentity(body: Record<string, unknown>) {
  const res = await fetch(`${MOCK}/__identity`, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error('mock google not reachable');
}

/** 本物のログイン経路(認可 → コード交換 → セッション)で毎回ログインする */
export async function login(page: Page, email = uniqueEmail(), name = 'テスト太郎') {
  await setIdentity({ email, name });
  await page.goto('/');
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId('app')).toBeVisible();
  return email;
}

export const composer = (page: Page) => page.getByTestId('composer-input');
export const column = (page: Page, status: 'todo' | 'doing' | 'done') => page.getByTestId(`column-${status}`);
export const cardIn = (page: Page, status: 'todo' | 'doing' | 'done', text: string) =>
  column(page, status).getByTestId('card').filter({ hasText: text });

export async function addMemo(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press('Enter');
  await expect(cardIn(page, 'todo', text)).toHaveCount(1);
}

/** マウスで素早く横に弾く(フリック) */
export async function flick(page: Page, card: Locator, dx: number, steps = 8) {
  const body = card.getByTestId('card-body');
  await body.scrollIntoViewIfNeeded();
  const box = (await body.boundingBox())!;
  const sx = box.x + box.width * 0.3;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(sx + (dx * i) / steps, sy);
  await page.mouse.up();
}

export interface ApiTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  position: number;
}
export async function apiTasks(page: Page): Promise<ApiTask[]> {
  const res = await page.request.get('/api/tasks');
  return ((await res.json()) as { tasks: ApiTask[] }).tasks;
}
export const apiStatusOf = (page: Page, title: string) => async () =>
  (await apiTasks(page)).find((t) => t.title === title)?.status;

/**
 * 「距離 dx を durationMs で弾く」フリックを、本物のブラウザ入力(trusted event)で再現する。
 * CDP の Input.dispatchMouseEvent はイベント時刻(timestamp)を指定できるため、実行環境の遅さに
 * 左右されず、速度(= dx / durationMs)だけを決定的に指定できる。
 * 例: 45px を 60ms → 約 750px/s の「短いが素早い」フリック
 */
export async function timedFlick(page: Page, card: Locator, dx: number, durationMs: number, steps = 5) {
  const box = (await card.getByTestId('card-body').boundingBox())!;
  const sx = box.x + box.width * 0.3;
  const sy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const base = Date.now() / 1000;
  const send = (type: string, x: number, t: number, extra: Record<string, unknown> = {}) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x,
      y: sy,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      timestamp: base + t / 1000,
      ...extra,
    } as never);
  await send('mouseMoved', sx, 0, { button: 'none', buttons: 0 });
  await send('mousePressed', sx, 0);
  for (let i = 1; i <= steps; i++) await send('mouseMoved', sx + (dx * i) / steps, (durationMs * i) / steps);
  await send('mouseReleased', sx + dx, durationMs);
  await cdp.detach();
}

/** トラックパッドの連続スワイプ(約 12ms 間隔の wheel イベント列)を再現する */
export async function trackpadSwipe(card: Locator, perEventDeltaX: number, events: number, intervalMs = 12, tailEvents = 0) {
  await card.getByTestId('card-body').evaluate(
    (el, { perEventDeltaX, events, intervalMs, tailEvents }) =>
      new Promise<void>((resolve) => {
        const r = el.getBoundingClientRect();
        let i = 0;
        const total = events + tailEvents;
        const send = () => {
          // 慣性の尾は徐々に小さくなる
          const d = i < events ? perEventDeltaX : perEventDeltaX * Math.max(0.1, 1 - (i - events) / tailEvents);
          el.dispatchEvent(new WheelEvent('wheel', { deltaX: d, deltaY: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
          if (++i < total) setTimeout(send, intervalMs);
          else resolve();
        };
        send();
      }),
    { perEventDeltaX, events, intervalMs, tailEvents },
  );
}

// ───────── 共有ボード ─────────
export const boardName = (page: Page) => page.getByTestId('board-name');

export async function openBoardMenu(page: Page) {
  await page.getByTestId('board-switcher').click();
  await expect(page.getByRole('menu')).toBeVisible();
}

export async function switchBoard(page: Page, name: string) {
  await openBoardMenu(page);
  await page.getByTestId('board-option').filter({ hasText: name }).click();
  await expect(boardName(page)).toHaveText(name);
}

export async function createBoard(page: Page, name: string) {
  await openBoardMenu(page);
  await page.getByTestId('board-new-input').fill(name);
  await page.getByTestId('board-create').click();
  await expect(boardName(page)).toHaveText(name);
}

export async function openShare(page: Page) {
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-panel')).toBeVisible();
}

export async function inviteMember(page: Page, email: string) {
  await openShare(page);
  await page.getByTestId('member-email').fill(email);
  await page.getByTestId('member-add').click();
  await expect(page.getByTestId('member-row').filter({ hasText: email })).toHaveCount(1);
  await page.getByTestId('share-close').click();
  await expect(page.getByTestId('share-panel')).toHaveCount(0);
}

/** 別ユーザーとして、独立したブラウザ(Cookie も別)でログインする */
export async function loginAs(browser: import('@playwright/test').Browser, email: string, name = '共有相手') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const problems: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await login(page, email, name);
  return { ctx, page, problems };
}

export async function boardIdOf(page: Page, name: string): Promise<string> {
  const res = await page.request.get('/api/bootstrap');
  const data = (await res.json()) as { boards: { id: string; name: string }[] };
  return data.boards.find((b) => b.name === name)!.id;
}
