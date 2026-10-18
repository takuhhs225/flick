// 全画面スケルトン。マークアップは index.html に埋め込んだ静的スケルトンと同一にしてあり、
// JS の読み込み前 → 読み込み後 → データ取得中 の間で見た目が途切れない。

export function HeaderSkeleton() {
  return (
    <header className="topbar" aria-hidden="true">
      <div className="brand">
        <div className="sk sk-logo" />
        <div className="sk sk-line" style={{ width: 54, height: 16 }} />
      </div>
      <div className="sk sk-avatar" />
    </header>
  );
}

export function ComposerSkeleton() {
  return (
    <div className="composer glass" aria-hidden="true">
      <div className="sk sk-line" style={{ width: '34%', height: 14, marginLeft: 36 }} />
    </div>
  );
}

const COUNTS = [3, 2, 2];

export function BoardSkeleton() {
  return (
    <>
      <div className="tabs sk-tabs" aria-hidden="true">
        <div className="sk" style={{ height: 40, borderRadius: 999, width: '100%' }} />
      </div>
      <div className="board is-skeleton" aria-hidden="true">
        {COUNTS.map((n, i) => (
          <section className="column glass" key={i}>
            <div className="col-head">
              <div className="sk sk-dot" />
              <div className="sk sk-line" style={{ width: 56, height: 14 }} />
            </div>
            <ul className="list">
              {Array.from({ length: n }, (_, j) => (
                <li className="card glass sk-card" key={j}>
                  <div className="sk sk-circle" />
                  <div className="sk-card-lines">
                    <div className="sk sk-line" style={{ width: `${88 - j * 14}%` }} />
                    <div className="sk sk-line" style={{ width: `${46 + j * 8}%`, height: 10 }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
