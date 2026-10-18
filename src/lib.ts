import { useEffect, useState } from 'react';

export function relTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 45) return 'たった今';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// --- 日本語 IME 対策 ---------------------------------------------------------
// 変換確定の Enter でメモが送信されてしまう事故を防ぐ。
// Chrome は keyCode 229 / isComposing で判別できるが、Safari は compositionend が
// keydown より先に発火して isComposing=false になるため、直前の確定時刻も見る。
let lastCompositionEnd = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('compositionend', () => (lastCompositionEnd = performance.now()), true);
}

export function isImeEnter(e: { nativeEvent: KeyboardEvent }): boolean {
  const ev = e.nativeEvent;
  return ev.isComposing || ev.keyCode === 229 || performance.now() - lastCompositionEnd < 80;
}

// --- フリックの速度 ----------------------------------------------------------
export interface PointerSample {
  t: number;
  x: number;
}

/**
 * ポインタイベント自身の時刻(event.timeStamp)から、離す直前の水平速度(px/s)を求める。
 * モーションライブラリの速度推定はフレーム単位の時刻に量子化されるため、短く速いフリックを
 * 取りこぼすことがある。最後に動きが止まってから離した場合(=迷っている/置いた)は 0 とする。
 */
export function releaseVelocity(samples: PointerSample[], releaseTime: number): number {
  const last = samples[samples.length - 1];
  if (!last || releaseTime - last.t > 90) return 0;
  const first = samples.find((s) => last.t - s.t <= 100) ?? last;
  const dt = last.t - first.t;
  return dt < 6 ? 0 : ((last.x - first.x) / dt) * 1000;
}
