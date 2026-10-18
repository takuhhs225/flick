import { test, expect } from '@playwright/test';
import { releaseVelocity } from '../../src/lib';

// フリック判定に使う「離す直前の速度」。フレーム時刻ではなくイベント自身の時刻から計算する。
test.describe('releaseVelocity', () => {
  test('一定速度の移動: 15px / 12ms = 1250px/s', () => {
    const s = [0, 1, 2, 3, 4].map((i) => ({ t: 1000 + i * 12, x: 100 + i * 15 }));
    expect(releaseVelocity(s, 1048)).toBeCloseTo(1250, 0);
  });

  test('左向きは負の速度', () => {
    const s = [0, 1, 2].map((i) => ({ t: 500 + i * 10, x: 300 - i * 10 }));
    expect(releaseVelocity(s, 520)).toBeCloseTo(-1000, 0);
  });

  test('最後に動きが止まってから離した(90ms 超)場合は 0 = 「置いた」扱い', () => {
    const s = [0, 1, 2].map((i) => ({ t: 1000 + i * 10, x: i * 40 }));
    expect(releaseVelocity(s, 1020 + 150)).toBe(0);
    expect(releaseVelocity(s, 1020 + 80)).not.toBe(0);
  });

  test('直近 100ms だけを見る: ゆっくり動かした後の最後の素早い動きを拾う', () => {
    const slow = [0, 1, 2, 3, 4, 5].map((i) => ({ t: i * 100, x: i * 2 })); // 20px/s
    const fast = [1, 2, 3].map((i) => ({ t: 500 + i * 10, x: 10 + i * 20 })); // 2000px/s
    expect(releaseVelocity([...slow, ...fast], 535)).toBeGreaterThan(1500);
  });

  test('サンプルが少なすぎる/時刻差が 6ms 未満のときは 0(ノイズ除去)', () => {
    expect(releaseVelocity([], 0)).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 0 }], 10)).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 3, x: 50 }], 5)).toBe(0);
  });
});
