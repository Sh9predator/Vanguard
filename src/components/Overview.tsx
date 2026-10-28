import type { ReactNode } from "react";
import { bytes, pct, rate } from "../format";
import { useStore } from "../store";
import Graph from "./Graph";

export const ACCENT = "#8B5CF6";
export const MUTED = "#A1A1AA";

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Panel({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {value && <span className="val">{value}</span>}
      </header>
      {children}
    </section>
  );
}

function Key({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="key">
      <i style={{ background: color }} />
      {label}
      <b>{value}</b>
    </span>
  );
}

export default function Overview() {
  const { snap, hist } = useStore();
  if (!snap) return <div className="empty">Waiting for first sample</div>;
  const memPct = snap.mt ? (snap.mu / snap.mt) * 100 : 0;

  return (
    <div className="overview">
      <Panel title="CPU" value={pct(snap.cpu)}>
        <Graph series={[{ data: hist.cpu, color: ACCENT, fill: true }]} max={100} fmt={(v) => `${v}%`} />
        <div className="cores">
          {snap.cores.map((v, i) => (
            <div className="core" key={i}>
              <span className="idx">{i}</span>
              <Bar value={v} />
              <span className="num">{Math.round(v)}%</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="col">
        <Panel title="Memory" value={`${bytes(snap.mu)} of ${bytes(snap.mt)}`}>
          <Bar value={memPct} />
          <div className="keys">
            <Key color={ACCENT} label="In use" value={pct(memPct)} />
            {snap.st > 0 && <Key color={MUTED} label="Swap" value={`${bytes(snap.su)} of ${bytes(snap.st)}`} />}
          </div>
          <Graph series={[{ data: hist.mem, color: ACCENT, fill: true }]} max={100} fmt={(v) => `${v}%`} />
        </Panel>

        <Panel title="Disk">
          <div className="keys">
            <Key color={ACCENT} label="Read" value={rate(snap.dr)} />
            <Key color={MUTED} label="Write" value={rate(snap.dw)} />
          </div>
          <Graph
            series={[{ data: hist.dr, color: ACCENT, fill: true }, { data: hist.dw, color: MUTED }]}
            floor={1024 * 1024}
            fmt={rate}
          />
        </Panel>

        <Panel title="Network">
          <div className="keys">
            <Key color={ACCENT} label="Receive" value={rate(snap.rx)} />
            <Key color={MUTED} label="Send" value={rate(snap.tx)} />
          </div>
          <Graph
            series={[{ data: hist.rx, color: ACCENT, fill: true }, { data: hist.tx, color: MUTED }]}
            floor={16 * 1024}
            fmt={rate}
          />
        </Panel>
      </div>
    </div>
  );
}
