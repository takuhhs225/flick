import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { User } from './types';
import { readSavedBoard, useBoard } from './useBoard';
import { ToastProvider, useToast } from './components/Toast';
import { Board } from './components/Board';
import { Composer, COMPOSER_ID } from './components/Composer';
import { Header } from './components/Header';
import { ErrorScreen, Login } from './components/Login';
import { BoardSkeleton, ComposerSkeleton, HeaderSkeleton } from './components/Skeleton';

type Phase = { name: 'boot' } | { name: 'login' } | { name: 'error' } | { name: 'app'; user: User };

const AUTHED_HINT = 'flick:authed';

const AUTH_ERRORS: Record<string, string> = {
  not_configured: 'Google認証が設定されていません',
  denied: 'ログインがキャンセルされました',
  not_allowed: 'このアカウントではログインできません',
  email_unverified: 'メールアドレスが確認されていないアカウントです',
};

const readHint = () => {
  try {
    return localStorage.getItem(AUTHED_HINT) === '1';
  } catch {
    return false;
  }
};
const writeHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(AUTHED_HINT, '1');
    else localStorage.removeItem(AUTHED_HINT);
  } catch {
    /* ignore */
  }
};

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ name: 'boot' });
  // 前回ログイン済みなら、スケルトン表示中からメモ入力欄を本物にして即入力できるようにする
  const [wasAuthed] = useState(readHint);

  const onUnauthorized = useCallback(() => {
    writeHint(false);
    setPhase({ name: 'login' });
    toast({ message: 'ログインの有効期限が切れました', tone: 'error' });
  }, [toast]);

  const board = useBoard({ toast, onUnauthorized });
  const { init } = board;

  const boot = useCallback(async () => {
    setPhase({ name: 'boot' });
    try {
      const r = await api.bootstrap(readSavedBoard());
      if (!r.user) {
        writeHint(false);
        setPhase({ name: 'login' });
        return;
      }
      writeHint(true);
      init(r);
      setPhase({ name: 'app', user: r.user });
    } catch {
      setPhase({ name: 'error' });
    }
  }, [init]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // ログイン失敗の理由を通知してから、URL からクエリを消す
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('auth_error');
    if (!code) return;
    toast({ message: AUTH_ERRORS[code] ?? 'ログインに失敗しました', tone: 'error' });
    history.replaceState(null, '', location.pathname);
  }, [toast]);

  // どこで打ち始めても、そのままメモ入力欄に入る
  const composerVisible = phase.name === 'app' || (phase.name === 'boot' && wasAuthed);
  useEffect(() => {
    if (!composerVisible) return;
    const focus = () => document.getElementById(COMPOSER_ID)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      focus();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!document.activeElement || document.activeElement === document.body)) focus();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [composerVisible]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      writeHint(false);
      setPhase({ name: 'login' });
    }
  };

  if (phase.name === 'login') return <Login />;
  if (phase.name === 'error') return <ErrorScreen onRetry={boot} />;

  const booting = phase.name === 'boot';
  return (
    <div className="app" data-testid={booting ? 'skeleton' : 'app'} data-state={booting ? 'boot' : 'ready'} aria-busy={booting}>
      {phase.name === 'app' ? <Header
          user={phase.user}
          onLogout={logout}
          boards={{
            boards: board.boards,
            boardId: board.boardId,
            onSwitch: board.switchBoard,
            onCreate: board.createBoard,
            onRename: board.renameBoard,
            onAddMember: board.addMember,
            onRemoveMember: board.removeMember,
            onDelete: board.deleteBoard,
          }}
        /> : <HeaderSkeleton />}
      {composerVisible ? <Composer ready={!booting} onSubmit={board.add} /> : <ComposerSkeleton />}
      {phase.name === 'app' ? (
        <Board
          switching={board.switching}
          tasks={board.tasks}
          hint={board.hint}
          busy={board.busy}
          onMove={board.move}
          onRename={board.rename}
          onDelete={board.remove}
          onRefine={board.refine}
          onBreakdown={board.breakdown}
        />
      ) : (
        <BoardSkeleton />
      )}
    </div>
  );
}
