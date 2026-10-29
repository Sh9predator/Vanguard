import { useState } from "react";
import type { CSSProperties } from "react";
import { bytes, pct, rate, volLabel, volName } from "../format";
import { pickDisk, pickNet } from "../pick";
import { choose, useStore } from "../store";
import Graph from "./Graph";
import CoreGrid from "./CoreGrid";
import { ACCENT, Bar, MUTED, Picker } from "./Overview";

const pctFmt = (v: number) => `${v}%`;
const isGpu = (id: string) => id.startsWith("gpu");
const cols = (c: string) => ({ "--cols": c }) as CSSProperties;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

export default function Performance() {
  const { snap, hist, disks, nets, sel } = useStore();
  const [metric, setMetric] = useState("cpu");
  if (!snap) return <div className="empty">Waiting for first sample</div>;

  const memPct = snap.mt ? (snap.mu / snap.mt) * 100 : 0;
  const peak = (a: number[]) => Math.max(0, ...a);
  const ids = ["cpu", "mem", "disk", "net", ...snap.gpus.map((_, i) => `gpu${i}`)];
  const active = ids.includes(metric) ? metric : "cpu";
  const gi = isGpu(active) ? Number(active.slice(3)) : -1;
  const gpu = gi >= 0 ? snap.gpus[gi] : undefined;
  const pd = pickDisk(snap, disks, hist, sel);
  const pn = pickNet(snap, nets, hist, sel);

  const name = (id: string) =>
    isGpu(id)
      ? snap.gpus.length > 1
        ? `GPU ${id.slice(3)}`
        : "GPU"
      : ({ cpu: "CPU", mem: "Memory", disk: "Disk", net: "Network" } as Record<string, string>)[id];

  // Sidebar entries always describe the whole machine; the detail header follows the picker.
  const summary = (id: string): string => {
    if (id === "cpu") return pct(snap.cpu);
    if (id === "mem") return pct(memPct);
    if (id === "disk") return `${rate(snap.dr)} read`;
    if (id === "net") return `${rate(snap.rx)} down`;
    return pct(snap.gpus[Number(id.slice(3))]?.u ?? 0, 0);
  };
  const headline =
    active === "disk" ? `${rate(pd.r)} read` : active === "net" ? `${rate(pn.rx)} down` : summary(active);

  const mini = (id: string): { data: number[]; color: string }[] => {
    if (id === "cpu") return [{ data: hist.cpu, color: ACCENT }];
    if (id === "mem") return [{ data: hist.mem, color: ACCENT }];
    if (id === "disk") return [{ data: hist.dr, color: ACCENT }, { data: hist.dw, color: MUTED }];
    if (id === "net") return [{ data: hist.rx, color: ACCENT }, { data: hist.tx, color: MUTED }];
    return [{ data: hist.gpu[Number(id.slice(3))] ?? [], color: ACCENT }];
  };

  const picker =
    active === "disk" ? (
      <Picker
        value={pd.vol ? pd.vol.m : "all"}
        options={[["all", "All volumes"], ...disks.map((d): [string, string] => [d.m, volLabel(d)])]}
        onChange={(v) => choose("disk", v)}
      />
    ) : active === "net" ? (
      <Picker
        value={pn.nic ? pn.nic.n : "all"}
        options={[["all", "All interfaces"], ...nets.map((n): [string, string] => [n.n, n.n])]}
        onChange={(v) => choose("net", v)}
      />
    ) : null;

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
          <div className="ttl">
            <h2>{name(active)}</h2>
            {picker}
            {active === "disk" && pd.vol && <span className="dim">{[pd.vol.k, pd.vol.f].filter(Boolean).join(", ")}</span>}
          </div>
          <span className="val">{headline}</span>
        </header>

        {active === "cpu" && (
          <>
            <Graph series={[{ data: hist.cpu, color: ACCENT, fill: true }]} max={100} fmt={pctFmt} minHeight={160} />
            <CoreGrid data={hist.cores} />
            {snap.ct !== undefined && (
              <div className="stats">
                <Row k="Temperature" v={`${Math.round(snap.ct)} \u00B0C`} />
              </div>
            )}
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
            <Graph
              series={[{ data: pd.rh, color: ACCENT, fill: true }, { data: pd.wh, color: MUTED }]}
              floor={1024 * 1024}
              fmt={rate}
              minHeight={140}
            />
            <div className="stats">
              <Row k="Read" v={rate(pd.r)} />
              <Row k="Write" v={rate(pd.w)} />
              <Row k="Peak read" v={rate(peak(pd.rh))} />
              <Row k="Peak write" v={rate(peak(pd.wh))} />
            </div>
            <h3>Volumes</h3>
            <div className="tbl" style={cols("minmax(110px,1fr) minmax(120px,1.2fr) 150px 90px 90px")}>
              <div className="tr th">
                <span>Volume</span>
                <span>Usage</span>
                <span className="num">Used / total</span>
                <span className="num">Read</span>
                <span className="num">Write</span>
              </div>
              {disks.map((d) => {
                const used = d.t - d.a;
                const detail = [d.k, d.f, d.x ? "removable" : ""].filter(Boolean).join(", ");
                return (
                  <div
                    className={`tr click${pd.vol?.m === d.m ? " on" : ""}`}
                    key={d.m}
                    title={`${d.m}  ${d.n}`.trim()}
                    onClick={() => choose("disk", pd.vol?.m === d.m ? "all" : d.m)}
                  >
                    <span>
                      {volName(d.m)} <i className="dim">{detail}</i>
                    </span>
                    <span>
                      <Bar value={d.t ? (used / d.t) * 100 : 0} />
                    </span>
                    <span className="num">
                      {bytes(used)} / {bytes(d.t)}
                    </span>
                    <span className="num">{rate(d.r)}</span>
                    <span className="num">{rate(d.w)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {active === "net" && (
          <>
            <Graph
              series={[{ data: pn.rxh, color: ACCENT, fill: true }, { data: pn.txh, color: MUTED }]}
              floor={16 * 1024}
              fmt={rate}
              minHeight={140}
            />
            <div className="stats">
              <Row k="Receive" v={rate(pn.rx)} />
              <Row k="Send" v={rate(pn.tx)} />
              <Row k="Peak receive" v={rate(peak(pn.rxh))} />
              <Row k="Peak send" v={rate(peak(pn.txh))} />
            </div>
            <h3>Interfaces</h3>
            <div className="tbl" style={cols("minmax(110px,1fr) minmax(130px,1.3fr) 100px 100px 100px 100px")}>
              <div className="tr th">
                <span>Interface</span>
                <span>Address</span>
                <span className="num">Down</span>
                <span className="num">Up</span>
                <span className="num">Total down</span>
                <span className="num">Total up</span>
              </div>
              {nets.length === 0 && (
                <div className="tr">
                  <span className="dim">No active interfaces</span>
                </div>
              )}
              {nets.map((n) => (
                <div
                  className={`tr click${pn.nic?.n === n.n ? " on" : ""}`}
                  key={n.n}
                  title={n.mac ? `MAC ${n.mac}` : undefined}
                  onClick={() => choose("net", pn.nic?.n === n.n ? "all" : n.n)}
                >
                  <span>{n.n}</span>
                  <span className="dim">{n.ip?.join(", ") || "\u2014"}</span>
                  <span className="num">{rate(n.rx)}</span>
                  <span className="num">{rate(n.tx)}</span>
                  <span className="num">{bytes(n.trx)}</span>
                  <span className="num">{bytes(n.ttx)}</span>
                </div>
              ))}
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
