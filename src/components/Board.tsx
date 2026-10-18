import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { STATUSES, STATUS_LABEL, type MotionHint, type Status, type Task } from '../types';
import { useMediaQuery } from '../lib';
import { Card } from './Card';

interface BoardProps {
  /** ボード切り替えの読み込み中 */
  switching?: boolean;
  tasks: Task[];
  hint: MotionHint | null;
  busy: ReadonlySet<string>;
  onMove: (id: string, to: Status, dir: number, via?: MotionHint['via']) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onRefine: (task: Task) => void;
  onBreakdown: (task: Task) => void;
}

/** 件数が変わるとき、数字が縦にスライドして入れ替わる */
function Count({ n }: { n: number }) {
  return (
    <span className="count" data-testid="count" aria-label={`${n}件`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={n}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{ display: 'inline-block' }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Column({ status, tasks, firstLoad, ...handlers }: { status: Status; tasks: Task[]; firstLoad: boolean } & Omit<BoardProps, 'tasks'>) {
  const { hint, busy } = handlers;
  return (
    <section className="column glass" data-testid={`column-${status}`} data-status={status} aria-label={STATUS_LABEL[status]}>
      <header className="col-head">
        <span className="dot" aria-hidden="true" />
        <h2>{STATUS_LABEL[status]}</h2>
        <Count n={tasks.length} />
      </header>
      <ul className="list">
        <AnimatePresence mode="popLayout" custom={hint}>
          {tasks.map((t, i) => (
            <Card
              key={t.id}
              task={t}
              hint={hint}
              stagger={firstLoad ? Math.min(i, 8) * 0.045 : 0}
              busy={busy.has(t.id)}
              onMove={handlers.onMove}
              onRename={handlers.onRename}
              onDelete={handlers.onDelete}
              onRefine={handlers.onRefine}
              onBreakdown={handlers.onBreakdown}
            />
          ))}
        </AnimatePresence>
      </ul>
      {tasks.length === 0 && <div className="col-empty" aria-hidden="true" />}
    </section>
  );
}

export function Board(props: BoardProps) {
  const wide = useMediaQuery('(min-width: 900px)');
  const [tab, setTab] = useState<Status>('todo');

  // 初回表示のときだけカードを順番に降らせる
  const [firstLoad, setFirstLoad] = useState(true);
  const timer = useRef(0);
  useEffect(() => {
    timer.current = window.setTimeout(() => setFirstLoad(false), 900);
    return () => window.clearTimeout(timer.current);
  }, []);

  const byStatus = (s: Status) => props.tasks.filter((t) => t.status === s).sort((a, b) => b.position - a.position);
  const { tasks: _omit, switching, ...rest } = props;
  void _omit;
  const cls = switching ? ' is-switching' : '';

  if (wide) {
    return (
      <LayoutGroup>
        <div className={`board${cls}`} data-testid="board" aria-busy={!!switching}>
          {STATUSES.map((s) => (
            <Column key={s} status={s} tasks={byStatus(s)} firstLoad={firstLoad} {...rest} />
          ))}
        </div>
      </LayoutGroup>
    );
  }

  return (
    <>
      <div className="tabs glass" role="tablist" data-testid="tabs">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={tab === s} data-testid={`tab-${s}`} className="tab" onClick={() => setTab(s)}>
            {tab === s && (
              <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
            )}
            <span className="tab-label">
              {STATUS_LABEL[s]}
              <Count n={byStatus(s).length} />
            </span>
          </button>
        ))}
      </div>
      <div className={`board is-narrow${cls}`} data-testid="board" aria-busy={!!switching}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.16 }}
          >
            <Column status={tab} tasks={byStatus(tab)} firstLoad={firstLoad} {...rest} />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
