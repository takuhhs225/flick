import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { composerStore, useComposer } from '../composerStore';
import { isImeEnter } from '../lib';
import { PlusIcon, ReturnIcon } from './icons';

interface Props {
  /** false の間(初期読み込み中)も入力はできる。Enter は読み込み完了後に自動送信される */
  ready: boolean;
  onSubmit: (title: string) => void;
}

export const COMPOSER_ID = 'composer-input';

export function Composer({ ready, onSubmit }: Props) {
  const { draft, queued } = useComposer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pulse, setPulse] = useState(0);

  // 開いた瞬間にフォーカス
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = () => {
    const title = composerStore.get().draft.replace(/\s+/g, ' ').trim();
    if (!title) return;
    if (!ready) return composerStore.set({ queued: true });
    composerStore.set({ draft: '', queued: false });
    onSubmit(title.slice(0, 500));
    setPulse((n) => n + 1);
    inputRef.current?.focus({ preventScroll: true });
  };

  // 読み込み中に押された Enter を、準備完了の瞬間に反映する
  useEffect(() => {
    if (ready && queued) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, queued]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (isImeEnter(e)) return; // 日本語変換の確定 Enter では送信しない
    e.preventDefault();
    submit();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div className="composer glass" data-pulse={pulse === 0 ? undefined : pulse % 2} onPointerMove={onPointerMove}>
      <span className="composer-icon" aria-hidden="true">
        <PlusIcon />
      </span>
      <input
        id={COMPOSER_ID}
        data-testid="composer-input"
        ref={inputRef}
        value={draft}
        maxLength={500}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="メモ"
        aria-label="メモを追加"
        onChange={(e) => composerStore.set({ draft: e.target.value })}
        onKeyDown={onKeyDown}
      />
      <span className={`composer-kbd${draft.trim() ? ' is-active' : ''}`} aria-hidden="true">
        <ReturnIcon />
      </span>
    </div>
  );
}
