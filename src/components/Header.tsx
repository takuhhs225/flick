import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { User } from '../types';
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

export function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
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
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
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
    </header>
  );
}
