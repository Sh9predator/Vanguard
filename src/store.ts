import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DiskInfo, NetInfo, Proc, Snapshot } from "./types";

/** Samples kept per series. Ring buffers are mutated in place; only `state` changes identity. */
export const HISTORY = 120;

export interface History {
  cpu: number[];
  mem: number[];
  dr: number[];
  dw: number[];
  rx: number[];
  tx: number[];
  cores: number[][];
  gpu: number[][];
  vram: number[][];
  /** Per-volume and per-interface history, keyed by mount point / interface name. */
  vol: Record<string, Pair>;
  net: Record<string, Pair>;
}

export interface Pair {
  a: number[]; // read / receive
  b: number[]; // write / send
}

/** Which volume, interface and GPU the Overview and Performance graphs show. */
export interface Sel {
  disk: string; // mount point, or "all"
  net: string; // interface name, or "all"
  gpu: number;
}

export interface State {
  snap: Snapshot | null;
  procs: Proc[];
  disks: DiskInfo[];
  nets: NetInfo[];
  sel: Sel;
  hist: History;
  intervalMs: number;
}

const KEY = "vanguard.interval";

function loadInterval(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 250 ? v : 1000;
  } catch {
    return 1000;
  }
}

let state: State = {
  snap: null,
  procs: [],
  disks: [],
  nets: [],
  sel: { disk: "all", net: "all", gpu: 0, ...read<Partial<Sel>>("sel", {}) },
  hist: { cpu: [], mem: [], dr: [], dw: [], rx: [], tx: [], cores: [], gpu: [], vram: [], vol: {}, net: {} },
  intervalMs: loadInterval(),
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function push(a: number[], v: number) {
  a.push(v);
  if (a.length > HISTORY) a.shift();
}

function ingest(s: Snapshot) {
  const h = state.hist;
  push(h.cpu, s.cpu);
  push(h.mem, s.mt ? (s.mu / s.mt) * 100 : 0);
  push(h.dr, s.dr);
  push(h.dw, s.dw);
  push(h.rx, s.rx);
  push(h.tx, s.tx);
  s.cores.forEach((v, i) => push((h.cores[i] ??= []), v));
  s.gpus.forEach((g, i) => {
    push((h.gpu[i] ??= []), g.u);
    push((h.vram[i] ??= []), g.mt ? (g.mu / g.mt) * 100 : 0);
  });
  for (const d of s.disks) {
    const p = (h.vol[d.m] ??= { a: [], b: [] });
    push(p.a, d.r);
    push(p.b, d.w);
  }
  for (const n of s.nets) {
    const p = (h.net[n.n] ??= { a: [], b: [] });
    push(p.a, n.rx);
    push(p.b, n.tx);
  }
  state = { ...state, snap: s, procs: s.procs ?? state.procs, disks: s.disks, nets: s.nets };
  emit();
}

export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

export async function start() {
  await listen<Snapshot>("metrics", (e) => ingest(e.payload));
  document.addEventListener("visibilitychange", () =>
    invoke("set_visible", { visible: !document.hidden }),
  );
  await invoke("set_interval", { ms: state.intervalMs });
}

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`vanguard.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`vanguard.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

export function choose<K extends keyof Sel>(key: K, value: Sel[K]) {
  state = { ...state, sel: { ...state.sel, [key]: value } };
  write("sel", state.sel);
  emit();
}

export function changeInterval(ms: number) {
  try {
    localStorage.setItem(KEY, String(ms));
  } catch {
    /* storage unavailable: keep in memory only */
  }
  state = { ...state, intervalMs: ms };
  emit();
  void invoke("set_interval", { ms });
}

export function wantProcesses(want: boolean) {
  void invoke("set_want_procs", { want });
}
