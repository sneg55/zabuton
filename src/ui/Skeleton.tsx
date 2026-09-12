import type { CSSProperties } from "react";

export function Skeleton({ w = "100%", h = 14, style }: { w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <span className="sk" aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}

export function PageSkeleton({ rows = 4, table = false }: { rows?: number; table?: boolean }) {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="page-head">
        <div className="stack" style={{ gap: 10 }}>
          <Skeleton w={220} h={36} />
          <Skeleton w={460} h={14} />
          <Skeleton w={380} h={14} />
        </div>
        <div className="counts">
          <Skeleton w={96} h={24} style={{ borderRadius: 999 }} />
          <Skeleton w={84} h={24} style={{ borderRadius: 999 }} />
          <Skeleton w={78} h={24} style={{ borderRadius: 999 }} />
        </div>
      </div>
      {table ? <TableSkeleton rows={rows} /> : <CardListSkeleton rows={rows} />}
    </div>
  );
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card sk-card">
          <div className="row between">
            <Skeleton w={`${44 + ((i * 17) % 30)}%`} h={18} />
            <div className="counts">
              <Skeleton w={88} h={24} style={{ borderRadius: 999 }} />
              <Skeleton w={72} h={24} style={{ borderRadius: 999 }} />
            </div>
          </div>
          <Skeleton w="38%" h={12} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap sk-table" aria-busy="true">
      <div className="sk-row sk-head" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} w="55%" h={12} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} w={`${50 + ((r * 13 + c * 29) % 40)}%`} h={14} />)}
        </div>
      ))}
    </div>
  );
}

export function SeatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="dais-seats" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="nameplate">
          <div className="nameplate-top">
            <Skeleton w="52%" h={16} />
            <Skeleton w="28%" h={11} />
          </div>
          <Skeleton w="100%" h={4} />
          <div className="nameplate-sub">
            <Skeleton w={70} h={22} style={{ borderRadius: 999 }} />
            <Skeleton w={90} h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Loading the clerk desk">
      <aside className="rail">
        <Skeleton w={110} h={22} />
        <div className="rail-city">
          <Skeleton w="100%" h={42} style={{ borderRadius: 12 }} />
          <Skeleton w={100} h={12} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {[92, 120, 108, 80, 60, 84].map((w, i) => <Skeleton key={i} w={w} h={20} style={{ margin: "6px 12px", borderRadius: 999 }} />)}
        </div>
      </aside>
      <main>
        <PageSkeleton rows={5} />
      </main>
    </div>
  );
}

export function PublicSkeleton() {
  return (
    <section className="hero" aria-busy="true" aria-label="Loading">
      <div className="hero-head">
        <Skeleton w="60%" h={56} />
        <Skeleton w="42%" h={56} />
        <Skeleton w={480} h={16} style={{ marginTop: 8 }} />
        <div className="row">
          <Skeleton w={190} h={40} style={{ borderRadius: 999 }} />
          <Skeleton w={130} h={40} style={{ borderRadius: 999 }} />
        </div>
      </div>
      <div className="card sk-card" style={{ gap: 14 }}>
        <Skeleton w={260} h={20} />
        <SeatGridSkeleton count={8} />
      </div>
    </section>
  );
}
