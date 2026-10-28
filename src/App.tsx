import { useEffect, useState } from "react";
import { bytes, pct } from "./format";
import { changeInterval, read, useStore, wantProcesses, write } from "./store";
import Overview from "./components/Overview";
import Processes from "./components/Processes";
import Performance from "./components/Performance";

const TABS = [
  ["overview", "Overview"],
  ["processes", "Processes"],
  ["performance", "Performance"],
] as const;
type Tab = (typeof TABS)[number][0];

const INTERVALS = [
  [500, "0.5 s"],
  [1000, "1 s"],
  [2000, "2 s"],
  [5000, "5 s"],
] as const;

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = read<string>("tab", "overview");
    return TABS.some(([id]) => id === saved) ? (saved as Tab) : "overview";
  });
  const { snap, intervalMs } = useStore();

  // The process list is only collected and shipped while its tab is open.
  useEffect(() => wantProcesses(tab === "processes"), [tab]);
  useEffect(() => write("tab", tab), [tab]);

  return (
    <>
      <header className="top">
        <nav role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              className="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <label className="refresh">
          Refresh
          <select value={intervalMs} onChange={(e) => changeInterval(Number(e.target.value))}>
            {INTERVALS.map(([ms, label]) => (
              <option key={ms} value={ms}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        {tab === "overview" && <Overview />}
        {tab === "processes" && <Processes />}
        {tab === "performance" && <Performance />}
      </main>

      <footer className="status">
        {snap ? (
          <>
            <span>CPU {pct(snap.cpu)}</span>
            <span>
              Memory {bytes(snap.mu)} of {bytes(snap.mt)}
            </span>
            <span>{snap.cores.length} logical cores</span>
          </>
        ) : (
          <span>Waiting for first sample</span>
        )}
      </footer>
    </>
  );
}
