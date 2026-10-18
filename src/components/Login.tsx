import { motion } from 'motion/react';
import { GoogleG, Logo } from './icons';

export function Login() {
  return (
    <main className="login">
      <motion.div
        className="login-card glass"
        data-testid="login"
        initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ default: { type: 'spring', stiffness: 260, damping: 26 }, filter: { duration: 0.22, ease: 'easeOut' } }}
      >
        <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}>
          <Logo size={64} />
        </motion.div>
        <h1 className="wordmark wordmark-lg">Flick</h1>
        <motion.a
          className="google-btn"
          data-testid="login-button"
          href="/api/auth/google"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <GoogleG />
          <span>Googleでログイン</span>
        </motion.a>
      </motion.div>
    </main>
  );
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="login">
      <div className="login-card glass" data-testid="load-error">
        <Logo size={48} />
        <p className="error-text">読み込めませんでした</p>
        <button type="button" className="google-btn" onClick={onRetry}>
          再読み込み
        </button>
      </div>
    </main>
  );
}
