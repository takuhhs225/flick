import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BoardInfo, User } from '../types';
import { BoardSwitcher } from './BoardSwitcher';
import { SharePanel } from './SharePanel';
import { Logo } from './icons';

function Avatar({ user }: { user: User }) {
  const [broken, setBroken] = useState(false);
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return user.picture && !broken ? (
    <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="avatar avatar-fallback">{initial}</span>
  );
}

export interface BoardControls {
  boards: BoardInfo[];
  boardId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onAddMember: (id: string, email: string) => Promise<boolean>;
  onRemoveMember: (id: string, email: string, self: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function Header({ user, onLogout, boards }: { user: User; onLogout: () => void; boards: BoardControls }) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const current = boards.boards.find((b) => b.id === boards.boardId);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="wordmark">Flick</span>
      </div>
      <BoardSwitcher
        boards={boards.boards}
        boardId={boards.boardId}
        onSwitch={boards.onSwitch}
        onCreate={boards.onCreate}
        onOpenShare={() => setSharing(true)}
      />
      <div className="account" ref={wrapRef}>
        <motion.button
          type="button"
          className="avatar-btn"
          data-testid="avatar"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="アカウント"
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => setOpen((o) => !o)}
        >
          <Avatar user={user} />
        </motion.button>
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              className="menu glass"
              style={{ transformOrigin: 'top right' }}
              initial={{ opacity: 0, scale: 0.9, y: -8, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.94, y: -4, filter: 'blur(4px)' }}
              transition={{ default: { type: 'spring', stiffness: 520, damping: 34 }, filter: { duration: 0.22, ease: 'easeOut' } }}
            >
              <div className="menu-user" data-testid="menu-user">
                {user.name && <strong>{user.name}</strong>}
                <span>{user.email}</span>
              </div>
              <button type="button" role="menuitem" data-testid="logout" onClick={onLogout}>
                ログアウト
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {sharing && current && (
          <SharePanel
            board={current}
            selfEmail={user.email}
            onClose={() => setSharing(false)}
            onRename={(n) => boards.onRename(current.id, n)}
            onAddMember={(e) => boards.onAddMember(current.id, e)}
            onRemoveMember={(e, self) => boards.onRemoveMember(current.id, e, self)}
            onDelete={() => boards.onDelete(current.id)}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
