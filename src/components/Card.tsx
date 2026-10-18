import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo, type Variants } from 'motion/react';
import { STATUSES, STATUS_LABEL, type MotionHint, type Status, type Task } from '../types';
import { isImeEnter, relTime, releaseVelocity, type PointerSample } from '../lib';
import { ArrowIcon, SparkleIcon, StatusIcon, TrashIcon } from './icons';

export interface CardProps {
  task: Task;
  ref?: Ref<HTMLLIElement>;
  hint: MotionHint | null;
  /** 初回表示時のカスケード用の遅延(秒) */
  stagger: number;
  busy: boolean;
  /** タップ/クリックで選択中(操作ボタンを表示)。同時に選択できるカードは1枚だけ */
  active: boolean;
  onActivate: (id: string | null) => void;
  onMove: (id: string, to: Status, dir: number, via?: MotionHint['via']) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onRefine: (task: Task) => void;
  onBreakdown: (task: Task) => void;
}

const SPRING_BACK = { type: 'spring', stiffness: 520, damping: 36 } as const;
const FLICK_DISTANCE = 84;
const FLICK_VELOCITY = 520;
const FLICK_MIN_OFFSET = 22;
const WHEEL_DISTANCE = 110;

function makeVariants(stagger: number): Variants {
  return {
    enter: (h: MotionHint | null) => ({
      opacity: 0,
      scale: 0.94,
      x: h?.kind === 'move' ? -h.dir * 40 : 0,
      y: h?.kind === 'add' ? -18 : h ? 0 : 12,
    }),
    show: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8, delay: stagger },
    },
    exit: (h: MotionHint | null) =>
      h?.kind === 'move'
        ? { opacity: 0, scale: 0.96, x: h.dir * 56, transition: { duration: 0.18, ease: 'easeIn' } }
        : { opacity: 0, scale: 0.88, transition: { duration: 0.2 } },
  };
}

export function Card({ task, ref, hint, stagger, busy, active, onActivate, onMove, onRename, onDelete, onRefine, onBreakdown }: CardProps) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], reduce ? [0, 0, 0] : [-2.5, 0, 2.5]);
  // 右へ引くと左側に「進める先」、左へ引くと右側に「戻す先」のヒントが現れる
  const nextOpacity = useTransform(x, [6, 72], [0, 1]);
  const prevOpacity = useTransform(x, [-72, -6], [1, 0]);
  const controls = useDragControls();
  const cardRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const samplesRef = useRef<PointerSample[]>([]);

  const [editing, setEditing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const cancelEdit = useRef(false);

  // 別のカードが選ばれたら、AI メニューも一緒に閉じる
  useEffect(() => {
    if (!active) setAiOpen(false);
  }, [active]);

  const idx = STATUSES.indexOf(task.status);
  const prev = STATUSES[idx - 1];
  const next = STATUSES[idx + 1];
  const variants = useMemo(() => makeVariants(stagger), [stagger]);

  const trigger = (dir: 1 | -1, via: MotionHint['via']): boolean => {
    const to = dir > 0 ? next : prev;
    if (!to) return false;
    animate(x, dir * (reduce ? 0 : 280), { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] });
    onMove(task.id, to, dir, via);
    return true;
  };

  // キーボードで移動した場合、移動先のカードにフォーカスを引き継ぐ
  useEffect(() => {
    if (hint?.kind === 'move' && hint.id === task.id && hint.via === 'key') cardRef.current?.focus();
    // マウント時のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset } = info;
    const velocity = releaseVelocity(samplesRef.current, event.timeStamp);
    const flick = Math.abs(offset.x) > FLICK_DISTANCE || (Math.abs(velocity) > FLICK_VELOCITY && Math.abs(offset.x) > FLICK_MIN_OFFSET);
    if (flick && trigger(offset.x > 0 ? 1 : -1, 'pointer')) return;
    animate(x, 0, SPRING_BACK);
  };

  // Mac のトラックパッド: 2本指の横スワイプ(wheel の deltaX)でも状態を変えられる
  useEffect(() => {
    const el = cardRef.current;
    if (!el || editing) return;
    let acc = 0;
    let locked = false;
    let fired = false;
    let timer = 0;

    const settle = () => {
      locked = false;
      if (!fired && acc !== 0) animate(x, 0, SPRING_BACK);
      acc = 0;
      fired = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦スクロールは邪魔しない
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 140); // 慣性スクロールの尾が終わるまでロック
      if (locked) return;
      acc += -e.deltaX; // 指を右へ = deltaX 負 = カードも右へ
      const dir = acc > 0 ? 1 : -1;
      const allowed = dir > 0 ? !!next : !!prev;
      x.set(allowed ? acc : acc * 0.25);
      if (allowed && Math.abs(acc) >= WHEEL_DISTANCE) {
        locked = true;
        fired = true;
        trigger(dir as 1 | -1, 'wheel');
      }
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
    };
    // trigger は task/next/prev に依存するため、それらで再登録する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, next, prev, task.id]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      trigger(1, 'key');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      trigger(-1, 'key');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(task.id);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      setEditing(true);
    }
  };

  const commit = (value: string) => {
    setEditing(false);
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    const title = value.replace(/\s+/g, ' ').trim();
    if (title && title !== task.title) onRename(task.id, title.slice(0, 500));
    cardRef.current?.focus();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <motion.li
      ref={ref}
      layout="position"
      className="card-wrap"
      data-testid="card"
      data-task-id={task.id}
      data-status={task.status}
      custom={hint}
      variants={variants}
      initial="enter"
      animate="show"
      exit="exit"
      transition={{ layout: { type: 'spring', stiffness: 520, damping: 40 } }}
    >
      {next && (
        <motion.div className="hint hint-next" style={{ opacity: nextOpacity }} data-status={next} aria-hidden="true">
          <ArrowIcon dir="right" />
          {STATUS_LABEL[next]}
        </motion.div>
      )}
      {prev && (
        <motion.div className="hint hint-prev" style={{ opacity: prevOpacity }} data-status={prev} aria-hidden="true">
          {STATUS_LABEL[prev]}
          <ArrowIcon dir="left" />
        </motion.div>
      )}

      <motion.div
        ref={cardRef}
        className={`card glass${busy ? ' is-busy' : ''}${aiOpen ? ' is-menu-open' : ''}${active ? ' is-active' : ''}`}
        data-testid="card-body"
        tabIndex={0}
        role="group"
        aria-label={`${task.title}(${STATUS_LABEL[task.status]})`}
        style={{ x, rotate }}
        drag={editing ? false : 'x'}
        dragControls={controls}
        dragListener={false}
        dragDirectionLock
        dragMomentum={false}
        dragElastic={0.2}
        dragConstraints={{ left: prev ? -9999 : 0, right: next ? 9999 : 0 }}
        onPointerDownCapture={() => onActivate(task.id)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !aiOpen && active && onActivate(null)}
        onDragStart={() => (draggedRef.current = true)}
        onDragEnd={onDragEnd}
        onPointerDown={(e) => {
          if (editing || (e.target as HTMLElement).closest('button, input')) return;
          draggedRef.current = false;
          samplesRef.current = [{ t: e.nativeEvent.timeStamp, x: e.clientX }];
          const record = (ev: PointerEvent) => {
            samplesRef.current.push({ t: ev.timeStamp, x: ev.clientX });
            if (samplesRef.current.length > 16) samplesRef.current.shift();
          };
          window.addEventListener('pointermove', record, { passive: true });
          window.addEventListener('pointerup', () => window.removeEventListener('pointermove', record), { once: true });
          window.addEventListener('pointercancel', () => window.removeEventListener('pointermove', record), { once: true });
          controls.start(e);
        }}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        whileTap={{ scale: 0.985 }}
      >
        <StatusIcon status={task.status} />
        <div className="card-main">
          {editing ? (
            <input
              className="card-edit"
              data-testid="card-edit"
              autoFocus
              defaultValue={task.title}
              maxLength={500}
              onPointerDown={stop}
              onBlur={(e) => commit(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeEnter(e)) {
                  e.preventDefault();
                  commit(e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  cancelEdit.current = true;
                  setEditing(false);
                  cardRef.current?.focus();
                }
              }}
            />
          ) : (
            <p
              className={`card-title${task.status === 'done' ? ' is-done' : ''}`}
              data-testid="card-title"
              onDoubleClick={() => !draggedRef.current && setEditing(true)}
            >
              {task.title}
            </p>
          )}
          <span className="card-meta">{relTime(task.updatedAt)}</span>
        </div>

        <div className="card-tools" onPointerDown={stop}>
          {prev && (
            <button type="button" aria-label={`${STATUS_LABEL[prev]}に戻す`} title={`${STATUS_LABEL[prev]}に戻す`} data-testid="tool-prev" onClick={() => trigger(-1, 'pointer')}>
              <ArrowIcon dir="left" />
            </button>
          )}
          <div className="ai-wrap">
            <button
              type="button"
              aria-label="AIメニュー"
              title="AI"
              aria-expanded={aiOpen}
              data-testid="tool-ai"
              disabled={busy}
              onClick={() => setAiOpen((o) => !o)}
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setAiOpen(false);
              }}
            >
              <SparkleIcon />
            </button>
            {aiOpen && (
              <motion.div
                className="ai-menu glass"
                role="menu"
                initial={{ opacity: 0, scale: 0.9, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setAiOpen(false);
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="ai-refine"
                  onClick={() => {
                    setAiOpen(false);
                    onRefine(task);
                  }}
                >
                  タスク名を整える
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="ai-breakdown"
                  onClick={() => {
                    setAiOpen(false);
                    onBreakdown(task);
                  }}
                >
                  サブタスクに分解
                </button>
              </motion.div>
            )}
          </div>
          <button type="button" aria-label="削除" title="削除" data-testid="tool-delete" onClick={() => onDelete(task.id)}>
            <TrashIcon />
          </button>
          {next && (
            <button type="button" aria-label={`${STATUS_LABEL[next]}に進める`} title={`${STATUS_LABEL[next]}に進める`} data-testid="tool-next" onClick={() => trigger(1, 'pointer')}>
              <ArrowIcon dir="right" />
            </button>
          )}
        </div>
      </motion.div>
    </motion.li>
  );
}
