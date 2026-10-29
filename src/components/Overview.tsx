import type { ReactNode } from "react";
import { bytes, pct, rate, volLabel, volName } from "../format";
import { pickDisk, pickNet } from "../pick";
import { choose, useStore } from "../store";
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

/** Dropdown for choosing which item's graph is shown. Only rendered when there is a choice. */
export function Picker({ value, options, onChange, min = 3 }: { value: string; options: [string, string][]; onChange: (v: string) => void; min?: number }) {
  if (options.length < min) return null; // "All" plus a single item is no choice
  return (
    <select className="pick" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Show graph for">
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Panel({ title, value, picker, children }: { title: string; value?: string; picker?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <div className="ttl">
          <h2>{title}</h2>
          {picker}
        </div>
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
  const { snap, hist, disks, nets, sel } = useStore();
  if (!snap) return <div className="empty">Waiting for first sample</div>;
  const memPct = snap.mt ? (snap.mu / snap.mt) * 100 : 0;

  const gi = Math.min(sel.gpu, snap.gpus.length - 1);
  const gpu = snap.gpus[gi]; // undefined when there is no GPU
  const pd = pickDisk(snap, disks, hist, sel);
  const pn = pickNet(snap, nets, hist, sel);

  // Disk gets extra height for its volume list.
  const rows = ["1fr", ...(gpu ? ["1fr"] : []), "1.5fr", "1fr"]
    .map((f) => `minmax(0, ${f})`)
    .join(" ");

  return (
    <div className="overview">
      <Panel title="CPU" value={pct(snap.cpu)}>
        {snap.ct !== undefined && (
          <div className="keys">
            <Key color={MUTED} label="Temp" value={`${Math.round(snap.ct)} \u00B0C`} />
          </div>
        )}
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

      <div className="col" style={{ gridTemplateRows: rows }}>
        <Panel title="Memory" value={`${bytes(snap.mu)} of ${bytes(snap.mt)}`}>
          <Bar value={memPct} />
          <div className="keys">
            <Key color={ACCENT} label="In use" value={pct(memPct)} />
            {snap.st > 0 && <Key color={MUTED} label="Swap" value={`${bytes(snap.su)} of ${bytes(snap.st)}`} />}
          </div>
          <Graph series={[{ data: hist.mem, color: ACCENT, fill: true }]} max={100} fmt={(v) => `${v}%`} />
        </Panel>

        {gpu && (
          <Panel
            title="GPU"
            value={pct(gpu.u, 0)}
            picker={
              <Picker
                value={String(gi)}
                options={snap.gpus.map((g, i): [string, string] => [String(i), g.n])}
                min={2}
                onChange={(v) => choose("gpu", Number(v))}
              />
            }
          >
            <div className="dim ellipsis" title={gpu.n}>
              {gpu.n}
            </div>
            <div className="keys">
              <Key color={ACCENT} label="Memory" value={`${bytes(gpu.mu)} of ${bytes(gpu.mt)}`} />
              {gpu.t !== undefined && <Key color={MUTED} label="Temp" value={`${gpu.t} \u00B0C`} />}
            </div>
            <Graph series={[{ data: hist.gpu[gi] ?? [], color: ACCENT, fill: true }]} max={100} fmt={(v) => `${v}%`} />
          </Panel>
        )}

        <Panel
          title="Disk"
          value={pd.vol ? volLabel(pd.vol) : disks.length ? `All ${disks.length} volume${disks.length === 1 ? "" : "s"}` : undefined}
          picker={
            <Picker
              value={pd.vol ? pd.vol.m : "all"}
              options={[["all", "All volumes"], ...disks.map((d): [string, string] => [d.m, volLabel(d)])]}
              onChange={(v) => choose("disk", v)}
            />
          }
        >
          <div className="keys">
            <Key color={ACCENT} label="Read" value={rate(pd.r)} />
            <Key color={MUTED} label="Write" value={rate(pd.w)} />
          </div>
          <Graph
            series={[{ data: pd.rh, color: ACCENT, fill: true }, { data: pd.wh, color: MUTED }]}
            floor={1024 * 1024}
            fmt={rate}
            minHeight={28}
          />
          <div className="vols">
            {disks.map((d) => {
              const used = d.t - d.a;
              return (
                <div
                  className={`vol${pd.vol?.m === d.m ? " on" : ""}`}
                  key={d.m}
                  title={`${d.n} ${d.f}`.trim()}
                  onClick={() => choose("disk", pd.vol?.m === d.m ? "all" : d.m)}
                >
                  <span className="vn">{volName(d.m)}</span>
                  <Bar value={d.t ? (used / d.t) * 100 : 0} />
                  <span className="num">
                    {bytes(used)} / {bytes(d.t)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Network"
          value={pn.nic ? pn.nic.n : undefined}
          picker={
            <Picker
              value={pn.nic ? pn.nic.n : "all"}
              options={[["all", "All interfaces"], ...nets.map((n): [string, string] => [n.n, n.n])]}
              onChange={(v) => choose("net", v)}
            />
          }
        >
          <div className="keys">
            <Key color={ACCENT} label="Receive" value={rate(pn.rx)} />
            <Key color={MUTED} label="Send" value={rate(pn.tx)} />
          </div>
          <Graph
            series={[{ data: pn.rxh, color: ACCENT, fill: true }, { data: pn.txh, color: MUTED }]}
            floor={16 * 1024}
            fmt={rate}
          />
        </Panel>
      </div>
    </div>
  );
}
