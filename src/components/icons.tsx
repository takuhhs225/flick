import { motion } from 'motion/react';

export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="flick-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8aa4ff" />
        <stop offset="1" stopColor="#b69cff" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="10" fill="url(#flick-logo)" />
    <path
      d="M9 16.5c3.2 0 5.6-1.2 7.2-3.6M9 21.5h10.5M9 11.5h5.5"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
    <path d="M18.5 9.5l5 3.2-5 3.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ArrowIcon = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg {...base} style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const SparkleIcon = () => (
  <svg {...base}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
);

export const ReturnIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M20 5v6a3 3 0 01-3 3H5M9 10l-4 4 4 4" />
  </svg>
);

export const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

/** 状態アイコン: 未着手=空の輪 / 進行中=回る輪 / 完了=チェックが描かれる */
export function StatusIcon({ status }: { status: 'todo' | 'doing' | 'done' }) {
  if (status === 'done') {
    return (
      <motion.svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="status-icon" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        <motion.circle cx="12" cy="12" r="10" fill="var(--done)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        <motion.path
          d="M7.5 12.5l3 3 6-7"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.08, duration: 0.32, ease: 'easeOut' }}
        />
      </motion.svg>
    );
  }
  if (status === 'doing') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="status-icon">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--doing)" strokeOpacity="0.25" strokeWidth="2.4" />
        <circle className="spin" cx="12" cy="12" r="9" fill="none" stroke="var(--doing)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="20 60" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="status-icon">
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--todo)" strokeWidth="2.4" />
    </svg>
  );
}
