import { test as base, expect } from '@playwright/test';

/**
 * 全テスト共通のガード: ブラウザのコンソールに error / warning / 未処理例外 / CSP 違反が
 * 1 件でも出たら失敗にする。意図的に出るものは consoleAllow で明示する。
 */
export const test = base.extend<{ consoleAllow: RegExp[]; guard: void }>({
  consoleAllow: [[], { option: true }],
  guard: [
    async ({ page, consoleAllow }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        const text = `${m.type()}: ${m.text()}`;
        if (!consoleAllow.some((re) => re.test(text))) problems.push(text);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await use();
      expect(problems, 'ブラウザコンソールにエラー/警告が出ていないこと').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
