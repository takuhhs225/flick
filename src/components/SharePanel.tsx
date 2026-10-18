import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import type { BoardInfo } from '../types';

interface Props {
  board: BoardInfo;
  selfEmail: string;
  onClose: () => void;
  onRename: (name: string) => Promise<boolean>;
  onAddMember: (email: string) => Promise<boolean>;
  onRemoveMember: (email: string, self: boolean) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

/** メンバー管理。所有者は招待・削除ができ、メンバーは退出できる */
export function SharePanel({ board, selfEmail, onClose, onRename, onAddMember, onRemoveMember, onDelete }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState(board.name);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(board.name), [board.name]);
  useEffect(() => {
    emailRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || adding) return;
    setAdding(true);
    const ok = await onAddMember(v);
    setAdding(false);
    if (ok) setEmail('');
  };

  const commitName = async () => {
    const n = name.trim();
    if (!board.isOwner || board.isPersonal || n === board.name) return setName(board.name);
    if (!(await onRename(n))) setName(board.name);
  };

  const canManage = board.isOwner && !board.isPersonal;

  return (
    <motion.div
      className="overlay"
      data-testid="share-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="share-panel glass"
        role="dialog"
        aria-modal="true"
        aria-label="メンバー"
        data-testid="share-panel"
        initial={{ opacity: 0, scale: 0.92, y: 16, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(4px)' }}
        transition={{ default: { type: 'spring', stiffness: 460, damping: 34 }, filter: { duration: 0.22, ease: 'easeOut' } }}
      >
        {canManage ? (
          <input
            className="share-title"
            data-testid="board-rename"
            value={name}
            maxLength={40}
            aria-label="ボード名"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <h2 className="share-title">{board.name}</h2>
        )}

        {board.isPersonal ? (
          <p className="share-note" data-testid="personal-note">
            マイボードは自分専用です。共有するには、新しいボードを作ってください。
          </p>
        ) : (
          <>
            <ul className="members" data-testid="members">
              {board.members.map((m) => {
                const isOwnerRow = m === board.ownerEmail;
                const isSelf = m === selfEmail.toLowerCase();
                return (
                  <li key={m} data-testid="member-row" data-email={m}>
                    <span className="member-email">{m}</span>
                    {isOwnerRow && <span className="member-tag">オーナー</span>}
                    {isSelf && !isOwnerRow && <span className="member-tag">自分</span>}
                    {board.isOwner && !isOwnerRow && (
                      <button type="button" data-testid="member-remove" onClick={() => void onRemoveMember(m, false)}>
                        外す
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {board.isOwner && (
              <form className="member-add" onSubmit={add}>
                <input
                  ref={emailRef}
                  type="email"
                  data-testid="member-email"
                  value={email}
                  placeholder="招待するメールアドレス"
                  aria-label="招待するメールアドレス"
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <button type="submit" data-testid="member-add" disabled={!email.trim() || adding}>
                  追加
                </button>
              </form>
            )}
            {board.isOwner && <p className="share-note">相手は、そのメールアドレスのGoogleアカウントでログインすると、このボードが見えます。</p>}
          </>
        )}

        <div className="share-foot">
          {!board.isPersonal && !board.isOwner && (
            <button type="button" className="danger" data-testid="board-leave" onClick={() => void onRemoveMember(selfEmail.toLowerCase(), true).then((ok) => ok && onClose())}>
              このボードから退出
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="danger"
              data-testid="board-delete"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                void onDelete().then((ok) => ok && onClose());
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'もう一度押すと削除します' : 'ボードを削除'}
            </button>
          )}
          <button type="button" data-testid="share-close" onClick={onClose}>
            閉じる
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
