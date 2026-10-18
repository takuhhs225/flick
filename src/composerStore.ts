import { useSyncExternalStore } from 'react';

// 入力中のメモを「スケルトン表示中 → 本画面」の切り替えをまたいで保持する小さなストア。
// 開いた瞬間に打ち始めても、読み込み完了時に取りこぼさず・消えず・自動で追加される。
interface ComposerState {
  draft: string;
  /** 読み込み中に Enter が押された: ready になった瞬間に送信する */
  queued: boolean;
}

let state: ComposerState = { draft: '', queued: false };
const subs = new Set<() => void>();

export const composerStore = {
  get: () => state,
  set(patch: Partial<ComposerState>) {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export const useComposer = () => useSyncExternalStore(composerStore.subscribe, composerStore.get);
