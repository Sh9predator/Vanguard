import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { bytes } from "../format";
import { read, useStore, write } from "../store";
import type { Proc } from "../types";

const ROW = 24;
type Key = keyof Proc;

const COLUMNS: { key: Key; label: string; num?: boolean; firstDir: 1 | -1 }[] = [
  { key: "n", label: "Name", firstDir: 1 },
  { key: "p", label: "PID", num: true, firstDir: 1 },
  { key: "c", label: "CPU", num: true, firstDir: -1 },
  { key: "m", label: "Memory", num: true, firstDir: -1 },
  { key: "s", label: "Status", firstDir: 1 },
];

interface Pending {
  pid: number;
  name: string;
  force: boolean;
}

export default function Processes() {
  const { procs } = useStore();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>(() => {
    const s = read<{ key: Key; dir: 1 | -1 }>("sort", { key: "c", dir: -1 });
    return COLUMNS.some((c) => c.key === s.key) && (s.dir === 1 || s.dir === -1) ? s : { key: "c", dir: -1 };
  });
  const [hover, setHover] = useState(false);
  const [notice, setNotice] = useState("");
  const frozen = useRef<{ id: string; pids: number[] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [scroll, setScroll] = useState(0);
  const [viewport, setViewport] = useState(400);
  const vp = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = vp.current!;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => write("sort", sort), [sort]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? procs.filter((p) => p.n.toLowerCase().includes(q) || String(p.p).includes(q)) : procs.slice();
    const { key, dir } = sort;
    const sorted = list.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      const d = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (d || a.p - b.p) * dir;
    });

    // While the pointer is over the table, keep row order fixed so a row doesn't
    // slide away mid-click. Values keep updating; new processes appear on leave.
    if (!hover) {
      frozen.current = null;
      return sorted;
    }
    const id = `${q}|${key}|${dir}`;
    if (frozen.current?.id !== id) {
      frozen.current = { id, pids: sorted.map((p) => p.p) };
      return sorted;
    }
    const byPid = new Map(procs.map((p) => [p.p, p]));
    return frozen.current.pids.flatMap((pid) => byPid.get(pid) ?? []);
  }, [procs, query, sort, hover]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const current = selected === null ? undefined : procs.find((p) => p.p === selected);

  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const last = Math.min(rows.length, Math.ceil((scroll + viewport) / ROW) + 4);

  const sortBy = (key: Key, firstDir: 1 | -1) =>
    setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: firstDir }));

  const ask = (force: boolean) => {
    if (!current) return;
    setError("");
    setPending({ pid: current.p, name: current.n, force });
  };

  const confirm = async () => {
    if (!pending) return;
    const { pid, force, name } = pending;
    setPending(null);
    try {
      await invoke("kill_process", { pid, force });
      setNotice(`Ended ${name} (${pid})`);
      setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const move = (delta: number) => {
    if (!rows.length) return;
    const at = rows.findIndex((p) => p.p === selected);
    const next = Math.min(rows.length - 1, Math.max(0, at < 0 ? 0 : at + delta));
    setSelected(rows[next].p);
    const el = vp.current!;
    const top = next * ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Delete") ask(e.shiftKey);
    else if (e.key === "Escape") setPending(null);
    else return;
    e.preventDefault();
  };

  return (
    <div className="procs">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter by name or PID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <span className="count">{rows.length} shown</span>
        <span className="spacer" />
        {hover && <span className="count">Order held</span>}
        {notice && <span className="dim">{notice}</span>}
        {error && <span className="error">{error}</span>}
        {pending ? (
          <>
            <span>
              {pending.force ? "Force kill" : "Terminate"} {pending.name} ({pending.pid})?
            </span>
            <button className="primary" onClick={confirm}>
              {pending.force ? "Force kill" : "Terminate"}
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </>
        ) : (
          <>
            <button disabled={!current} onClick={() => ask(false)} title="Delete">
              Terminate
            </button>
            <button disabled={!current} onClick={() => ask(true)} title="Shift+Delete">
              Force kill
            </button>
          </>
        )}
      </div>

      <div className="thead row-grid">
        {COLUMNS.map((c) => (
          <button key={c.key} className={c.num ? "num" : ""} onClick={() => sortBy(c.key, c.firstDir)}>
            {c.label}
            {sort.key === c.key && <span className="arrow">{sort.dir === 1 ? "\u25B2" : "\u25BC"}</span>}
          </button>
        ))}
      </div>

      <div ref={vp} className="vp" tabIndex={0} onKeyDown={onKey} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onScroll={(e) => { setScroll(e.currentTarget.scrollTop); setMenu(null); }}>
        {rows.length === 0 ? (
          <div className="empty">{procs.length ? "No process matches the filter" : "Loading processes"}</div>
        ) : (
          <div style={{ height: rows.length * ROW, position: "relative" }}>
            {rows.slice(first, last).map((p, i) => (
              <div
                key={p.p}
                className={`row row-grid${p.p === selected ? " selected" : ""}`}
                style={{ transform: `translateY(${(first + i) * ROW}px)` }}
                onClick={() => setSelected(p.p)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected(p.p);
                  setError("");
                  setMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <span className="name" title={p.n}>
                  {p.n}
                </span>
                <span className="num dim">{p.p}</span>
                <span className={`num${p.c >= 50 ? " hot" : ""}`}>{p.c.toFixed(1)}%</span>
                <span className="num">{bytes(p.m)}</span>
                <span className="dim">{p.s}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {menu && current && (
        <ul
          className="ctx"
          style={{
            left: Math.min(menu.x, window.innerWidth - 176),
            top: Math.min(menu.y, window.innerHeight - 140),
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <li><button onClick={() => ask(false)}>Terminate</button></li>
          <li><button onClick={() => ask(true)}>Force kill</button></li>
          <li className="sep" />
          <li><button onClick={() => copy(String(current.p))}>Copy PID</button></li>
          <li><button onClick={() => copy(current.n)}>Copy name</button></li>
        </ul>
      )}
    </div>
  );
}
