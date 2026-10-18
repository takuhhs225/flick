import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BoardInfo } from '../types';

interface Props {
  boards: BoardInfo[];
  boardId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onOpenShare: () => void;
}

/** ヘッダーのボード切り替え。メンバーがいるボードには人数を表示する */
export function BoardSwitcher({ boards, boardId, onSwitch, onCreate, onOpenShare }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = boards.find((b) => b.id === boardId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || creating) return;
    setCreating(true);
    const ok = await onCreate(n);
    setCreating(false);
    if (ok) {
      setName('');
      setOpen(false);
    }
  };

  const shared = current && current.members.length > 1;

  return (
    <div className="board-switch" ref={wrapRef}>
      <motion.button
        type="button"
        className="board-btn"
        data-testid="board-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="board-name" data-testid="board-name">
          {current?.name ?? ''}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.button>
      <motion.button
        type="button"
        className="share-btn"
        data-testid="share-button"
        aria-label="メンバー"
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          setOpen(false);
          onOpenShare();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="6" cy="5.4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1.8 13c.4-2.3 2.1-3.5 4.2-3.5s3.8 1.2 4.2 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10.6 3.4a2.2 2.2 0 0 1 0 4.2M12 9.7c1.4.5 2.2 1.5 2.5 3.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {shared && <span data-testid="member-count">{current.members.length}</span>}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="menu board-menu glass"
            style={{ transformOrigin: 'top left' }}
            initial={{ opacity: 0, scale: 0.92, y: -8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: -4, filter: 'blur(4px)' }}
            transition={{ default: { type: 'spring', stiffness: 520, damping: 34 }, filter: { duration: 0.22, ease: 'easeOut' } }}
          >
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                role="menuitemradio"
                aria-checked={b.id === boardId}
                data-testid="board-option"
                className={b.id === boardId ? 'is-current' : ''}
                onClick={() => {
                  setOpen(false);
                  onSwitch(b.id);
                }}
              >
                <span className="board-option-name">{b.name}</span>
                {b.members.length > 1 && <span className="board-option-meta">{b.members.length}人</span>}
              </button>
            ))}
            <form className="board-new" onSubmit={submit}>
              <input
                data-testid="board-new-input"
                value={name}
                maxLength={40}
                placeholder="新しいボード"
                aria-label="新しいボードの名前"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <button type="submit" data-testid="board-create" disabled={!name.trim() || creating}>
                作成
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
