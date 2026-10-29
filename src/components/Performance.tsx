import { useState } from "react";
import { bytes, pct, rate } from "../format";
import { useStore } from "../store";
import Graph from "./Graph";
import { ACCENT, MUTED } from "./Overview";

const pctFmt = (v: number) => `${v}%`;
const isGpu = (id: string) => id.startsWith("gpu");

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
  const [metric, setMetric] = useState("cpu");
  if (!snap) return <div className="empty">Waiting for first sample</div>;

  const memPct = snap.mt ? (snap.mu / snap.mt) * 100 : 0;
  const peak = (a: number[]) => Math.max(0, ...a);
  const ids = ["cpu", "mem", "disk", "net", ...snap.gpus.map((_, i) => `gpu${i}`)];
  const active = ids.includes(metric) ? metric : "cpu";
  const gi = isGpu(active) ? Number(active.slice(3)) : -1;
  const gpu = gi >= 0 ? snap.gpus[gi] : undefined;

  const name = (id: string) =>
    isGpu(id) ? (snap.gpus.length > 1 ? `GPU ${id.slice(3)}` : "GPU") : { cpu: "CPU", mem: "Memory", disk: "Disk", net: "Network" }[id]!;

  const summary = (id: string): string => {
    if (id === "cpu") return pct(snap.cpu);
    if (id === "mem") return pct(memPct);
    if (id === "disk") return `${rate(snap.dr)} read`;
    if (id === "net") return `${rate(snap.rx)} down`;
    return pct(snap.gpus[Number(id.slice(3))]?.u ?? 0, 0);
  };

  const mini = (id: string): { data: number[]; color: string }[] => {
    if (id === "cpu") return [{ data: hist.cpu, color: ACCENT }];
    if (id === "mem") return [{ data: hist.mem, color: ACCENT }];
    if (id === "disk") return [{ data: hist.dr, color: ACCENT }, { data: hist.dw, color: MUTED }];
    if (id === "net") return [{ data: hist.rx, color: ACCENT }, { data: hist.tx, color: MUTED }];
    return [{ data: hist.gpu[Number(id.slice(3))] ?? [], color: ACCENT }];
  };

  return (
    <div className="perf">
      <ul className="master">
        {ids.map((id) => (
          <li key={id}>
            <button aria-selected={active === id} onClick={() => setMetric(id)}>
              <span className="name">{name(id)}</span>
              <span className="sum">{summary(id)}</span>
              <Graph
                series={mini(id)}
                max={id === "disk" || id === "net" ? undefined : 100}
                floor={64 * 1024}
                height={32}
                label={false}
              />
            </button>
          </li>
        ))}
      </ul>

      <section className="detail">
        <header>
          <h2>{name(active)}</h2>
          <span className="val">{summary(active)}</span>
        </header>

        {active === "cpu" && (
          <>
            <Graph series={[{ data: hist.cpu, color: ACCENT, fill: true }]} max={100} fmt={pctFmt} minHeight={160} />
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

        {active === "mem" && (
          <>
            <Graph series={[{ data: hist.mem, color: ACCENT, fill: true }]} max={100} fmt={pctFmt} minHeight={160} />
            <div className="stats">
              <Row k="In use" v={bytes(snap.mu)} />
              <Row k="Available" v={bytes(snap.mt - snap.mu)} />
              <Row k="Total" v={bytes(snap.mt)} />
              <Row k="Swap" v={snap.st ? `${bytes(snap.su)} of ${bytes(snap.st)}` : "None"} />
            </div>
          </>
        )}

        {active === "disk" && (
          <>
            <Graph series={[{ data: hist.dr, color: ACCENT, fill: true }, { data: hist.dw, color: MUTED }]} floor={1024 * 1024} fmt={rate} minHeight={160} />
            <div className="stats">
              <Row k="Read" v={rate(snap.dr)} />
              <Row k="Write" v={rate(snap.dw)} />
              <Row k="Peak read" v={rate(peak(hist.dr))} />
              <Row k="Peak write" v={rate(peak(hist.dw))} />
            </div>
          </>
        )}

        {active === "net" && (
          <>
            <Graph series={[{ data: hist.rx, color: ACCENT, fill: true }, { data: hist.tx, color: MUTED }]} floor={16 * 1024} fmt={rate} minHeight={160} />
            <div className="stats">
              <Row k="Receive" v={rate(snap.rx)} />
              <Row k="Send" v={rate(snap.tx)} />
              <Row k="Peak receive" v={rate(peak(hist.rx))} />
              <Row k="Peak send" v={rate(peak(hist.tx))} />
            </div>
          </>
        )}

        {gpu && (
          <>
            <Graph series={[{ data: hist.gpu[gi] ?? [], color: ACCENT, fill: true }]} max={100} fmt={pctFmt} minHeight={140} />
            <span className="idx">Memory use</span>
            <Graph series={[{ data: hist.vram[gi] ?? [], color: MUTED, fill: true }]} max={100} fmt={pctFmt} height={90} />
            <div className="stats">
              <Row k="Utilization" v={pct(gpu.u, 0)} />
              <Row k="Memory in use" v={`${bytes(gpu.mu)} of ${bytes(gpu.mt)}`} />
              <Row k="Temperature" v={gpu.t !== undefined ? `${gpu.t} \u00B0C` : "Not reported"} />
              <Row k="Model" v={gpu.n} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
