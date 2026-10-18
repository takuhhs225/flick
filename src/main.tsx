import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 背景の色の溜まりを、ポインタの位置に合わせてゆっくりずらす(視差)。動かしている間だけ描画される。
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let raf = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const root = document.documentElement.style;
        root.setProperty('--px', String(e.clientX / window.innerWidth - 0.5));
        root.setProperty('--py', String(e.clientY / window.innerHeight - 0.5));
      });
    },
    { passive: true },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
