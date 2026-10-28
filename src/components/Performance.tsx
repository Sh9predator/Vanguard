import { useState } from "react";
import { bytes, pct, rate } from "../format";
import { useStore } from "../store";
import Graph from "./Graph";
import { ACCENT, MUTED } from "./Overview";

type Metric = "cpu" | "mem" | "disk" | "net";

const NAMES: Record<Metric, string> = { cpu: "CPU", mem: "Memory", disk: "Disk", net: "Network" };
const pctFmt = (v: number) => `${v}%`;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

export default function Performance() {
  const { snap, hist } = useStore();
  const [metric, setMetric] = useState<Metric>("cpu");
  if (!snap) return <div className="empty">Waiting for first sample</div>;

  const memPct = snap.mt ? (snap.mu / snap.mt) * 100 : 0;
  const peak = (a: number[]) => Math.max(0, ...a);

  const summary: Record<Metric, string> = {
    cpu: pct(snap.cpu),
    mem: pct(memPct),
    disk: `${rate(snap.dr)} read`,
    net: `${rate(snap.rx)} down`,
  };
  const mini: Record<Metric, { data: number[]; color: string }[]> = {
    cpu: [{ data: hist.cpu, color: ACCENT }],
    mem: [{ data: hist.mem, color: ACCENT }],
    disk: [{ data: hist.dr, color: ACCENT }, { data: hist.dw, color: MUTED }],
    net: [{ data: hist.rx, color: ACCENT }, { data: hist.tx, color: MUTED }],
  };

  return (
    <div className="perf">
      <ul className="master">
        {(Object.keys(NAMES) as Metric[]).map((m) => (
          <li key={m}>
            <button aria-selected={metric === m} onClick={() => setMetric(m)}>
              <span className="name">{NAMES[m]}</span>
              <span className="sum">{summary[m]}</span>
              <Graph series={mini[m]} max={m === "cpu" || m === "mem" ? 100 : undefined} floor={64 * 1024} height={32} label={false} />
            </button>
          </li>
        ))}
      </ul>

      <section className="detail">
        <header>
          <h2>{NAMES[metric]}</h2>
          <span className="val">{summary[metric]}</span>
        </header>

        {metric === "cpu" && (
          <>
            <Graph series={[{ data: hist.cpu, color: ACCENT, fill: true }]} max={100} fmt={pctFmt} />
            <div className="small-multiples">
              {hist.cores.map((d, i) => (
                <div key={i}>
                  <span className="idx">Core {i}</span>
                  <Graph series={[{ data: d, color: ACCENT, fill: true }]} max={100} height={40} label={false} />
                </div>
              ))}
            </div>
          </>
        )}

        {metric === "mem" && (
          <>
            <Graph series={[{ data: hist.mem, color: ACCENT, fill: true }]} max={100} fmt={pctFmt} />
            <div className="stats">
              <Row k="In use" v={bytes(snap.mu)} />
              <Row k="Available" v={bytes(snap.mt - snap.mu)} />
              <Row k="Total" v={bytes(snap.mt)} />
              <Row k="Swap" v={snap.st ? `${bytes(snap.su)} of ${bytes(snap.st)}` : "None"} />
            </div>
          </>
        )}

        {metric === "disk" && (
          <>
            <Graph series={[{ data: hist.dr, color: ACCENT, fill: true }, { data: hist.dw, color: MUTED }]} floor={1024 * 1024} fmt={rate} />
            <div className="stats">
              <Row k="Read" v={rate(snap.dr)} />
              <Row k="Write" v={rate(snap.dw)} />
              <Row k="Peak read" v={rate(peak(hist.dr))} />
              <Row k="Peak write" v={rate(peak(hist.dw))} />
            </div>
          </>
        )}

        {metric === "net" && (
          <>
            <Graph series={[{ data: hist.rx, color: ACCENT, fill: true }, { data: hist.tx, color: MUTED }]} floor={16 * 1024} fmt={rate} />
            <div className="stats">
              <Row k="Receive" v={rate(snap.rx)} />
              <Row k="Send" v={rate(snap.tx)} />
              <Row k="Peak receive" v={rate(peak(hist.rx))} />
              <Row k="Peak send" v={rate(peak(hist.tx))} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
